"""Access checks use mocked GitHub responses; these tests never upload files."""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
import urllib.error
import urllib.request
from email.message import Message
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse


SCRIPT = Path(__file__).resolve().parents[1] / "upload_github_asset.py"
SPEC = importlib.util.spec_from_file_location("upload_github_asset", SCRIPT)
uploader = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(uploader)

ASSET = "https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc"
TOKEN = "test-token"
PNG = b"\x89PNG\r\n\x1a\nexample"


def response(status=200, content_type="image/png", body=PNG):
    result = io.BytesIO(body)
    result.status = status
    result.headers = Message()
    result.headers["Content-Type"] = content_type
    return result


def denied(status):
    return urllib.error.HTTPError(ASSET, status, "denied", Message(), io.BytesIO())


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "figure.png"
        self.path.write_bytes(PNG)
        self.metadata = {"id": 42, "visibility": "public"}
        self.gh = self.enterContext(patch.object(uploader, "run_gh", side_effect=self.run_gh))
        self.opener = Mock()
        self.enterContext(patch.object(uploader.urllib.request, "build_opener", return_value=self.opener))
        self.enterContext(patch.object(uploader.sys, "argv", [str(SCRIPT), str(self.path), "--repo", "example/target"]))
        self.stdout = io.StringIO()
        self.enterContext(contextlib.redirect_stdout(self.stdout))

    def run_gh(self, *args):
        if args == ("api", "--hostname", "github.com", "repos/example/target", "--jq", "{id, visibility} | @json"):
            return json.dumps(self.metadata)
        if args == ("auth", "token", "--hostname", "github.com"):
            return TOKEN
        self.fail(f"unexpected gh call: {args}")

    def prepare(self, anonymous):
        self.opener.open.side_effect = [
            response(201, "application/json", json.dumps({"url": ASSET}).encode()),
            anonymous,
        ]

    def test_public_upload_uses_target_repository_without_download_checks(self):
        self.prepare(response())
        uploader.main()
        self.assertEqual(self.stdout.getvalue(), ASSET + "\n")
        self.assertEqual(self.opener.open.call_count, 1)
        upload = self.opener.open.call_args.args[0]
        self.assertEqual(upload.get_method(), "POST")
        self.assertEqual(parse_qs(urlparse(upload.full_url).query)["repository_id"], ["42"])
        self.assertEqual(upload.data, PNG)
        self.assertEqual(upload.get_header("Authorization"), f"Bearer {TOKEN}")

    def test_private_and_internal_uploads_accept_anonymous_denial(self):
        for visibility in ("private", "internal"):
            for status in (401, 403, 404):
                with self.subTest(visibility=visibility, status=status):
                    self.stdout.seek(0)
                    self.stdout.truncate()
                    self.metadata["visibility"] = visibility
                    self.prepare(denied(status))
                    uploader.main()
                    self.assertEqual(self.stdout.getvalue(), ASSET + "\n")
                    anonymous = self.opener.open.call_args.args[0]
                    self.assertEqual(anonymous.full_url, ASSET)
                    self.assertIsNone(anonymous.get_header("Authorization"))
                    self.assertIsNone(anonymous.get_header("Cookie"))

    def test_private_anonymous_success_reports_existing_exposure_without_publishing(self):
        for visibility in ("private", "internal"):
            for status in (200, 206):
                with self.subTest(visibility=visibility, status=status):
                    self.metadata["visibility"] = visibility
                    self.prepare(response(status))
                    with self.assertRaisesRegex(SystemExit, "upload already exists") as error:
                        uploader.main()
                    self.assertIn(ASSET, str(error.exception))
                    self.assertEqual(self.stdout.getvalue(), "")

    def test_public_raw_url_404_does_not_block_confirmed_upload(self):
        self.opener.open.side_effect = [
            response(201, "application/json", json.dumps({"url": ASSET}).encode()),
            denied(404),
            response(),
        ]
        uploader.main()
        self.assertEqual(self.stdout.getvalue(), ASSET + "\n")
        self.assertEqual(self.opener.open.call_count, 1)

    def test_internal_upload_does_not_require_api_token_to_establish_browser_sso(self):
        self.metadata["visibility"] = "internal"
        # An API token can receive a browser SSO page after a successful
        # repository-scoped upload. Publishing must not depend on that GET.
        self.opener.open.side_effect = [
            response(201, "application/json", json.dumps({"url": ASSET}).encode()),
            denied(404),
            response(content_type="text/html", body=b"<title>Sign in to Example Organization</title>"),
        ]
        uploader.main()
        self.assertEqual(self.stdout.getvalue(), ASSET + "\n")
        self.assertEqual(self.opener.open.call_count, 2)

    def test_upload_failure_does_not_return_an_asset_url(self):
        self.opener.open.side_effect = [denied(403)]
        with self.assertRaisesRegex(SystemExit, "upload failed with HTTP 403"):
            uploader.main()
        self.assertEqual(self.stdout.getvalue(), "")
        self.assertEqual(self.opener.open.call_count, 1)

    def test_inconclusive_anonymous_checks_do_not_pass_for_private_uploads(self):
        self.metadata["visibility"] = "private"
        for anonymous in (denied(429), denied(500), urllib.error.URLError("timeout")):
            with self.subTest(anonymous=anonymous):
                self.prepare(anonymous)
                with self.assertRaisesRegex(SystemExit, "inconclusive"):
                    uploader.main()
                self.assertEqual(self.stdout.getvalue(), "")

    def test_non_created_upload_response_does_not_return_a_url(self):
        self.opener.open.side_effect = [response(200, "application/json", json.dumps({"url": ASSET}).encode())]
        with self.assertRaisesRegex(SystemExit, "upload failed with HTTP 200"):
            uploader.main()
        self.assertEqual(self.stdout.getvalue(), "")
        self.assertEqual(self.opener.open.call_count, 1)

    def test_unknown_repository_scope_stops_before_upload(self):
        for metadata in ({"id": 42}, {"id": 42, "visibility": "unknown"}, {"id": None, "visibility": "private"}):
            with self.subTest(metadata=metadata):
                self.metadata = metadata
                with self.assertRaisesRegex(SystemExit, "nothing uploaded"):
                    uploader.main()
                self.opener.open.assert_not_called()
                self.assertEqual(self.stdout.getvalue(), "")

    def test_unexpected_or_signed_urls_are_rejected_before_sending_credentials(self):
        for url in (ASSET + "?token=secret", ASSET + "#fragment", ASSET.replace("https:", "http:"), ASSET.replace("github.com", "example.com")):
            with self.subTest(url=url):
                with self.assertRaisesRegex(SystemExit, "unexpected attachment URL"):
                    uploader.verify_asset_access(url, "private")
                self.opener.open.assert_not_called()


class RepositoryTests(unittest.TestCase):
    def test_implicit_repository_comes_from_checkout_url(self):
        with patch.object(uploader, "run_gh", side_effect=["https://github.com/example/target", '{"id": 42, "visibility": "private"}']) as gh:
            self.assertEqual(uploader.resolve_repository(None), (42, "private"))
            gh.assert_called_with("api", "--hostname", "github.com", "repos/example/target", "--jq", "{id, visibility} | @json")

    def test_enterprise_checkout_cannot_upload_to_github_com(self):
        with patch.object(uploader, "run_gh", return_value="https://git.example.com/example/target") as gh:
            with self.assertRaisesRegex(SystemExit, "github.com-only"):
                uploader.resolve_repository(None)
            self.assertEqual(gh.call_count, 1)


class RedirectTests(unittest.TestCase):
    def test_download_redirect_drops_authentication(self):
        request = urllib.request.Request(ASSET, headers={"Authorization": f"Bearer {TOKEN}", "Cookie": "session=test"})
        redirect = uploader.AttachmentRedirectHandler().redirect_request(
            request, None, 302, "Found", {}, "https://private-user-images.githubusercontent.com/example.png?signature=temporary"
        )
        self.assertIsNone(redirect.get_header("Authorization"))
        self.assertIsNone(redirect.get_header("Cookie"))

    def test_upload_and_insecure_redirects_are_not_followed(self):
        handler = uploader.AttachmentRedirectHandler()
        upload = urllib.request.Request("https://uploads.github.com/user-attachments/assets", data=PNG)
        self.assertIsNone(handler.redirect_request(upload, None, 302, "Found", {}, "https://example.com/upload"))
        download = urllib.request.Request(ASSET)
        self.assertIsNone(handler.redirect_request(download, None, 302, "Found", {}, "http://example.com/image.png"))


if __name__ == "__main__":
    unittest.main()
