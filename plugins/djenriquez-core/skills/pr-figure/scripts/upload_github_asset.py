#!/usr/bin/env python3
"""Upload a local image as a GitHub user-attachment and print its URL.

Usage: upload_github_asset.py <file-path> [--repo owner/repo]

Requires an authenticated GitHub CLI (`gh`) pointed at github.com. Uploads
are bound to the target repository; GitHub assigns access from that scope.
Check private/internal uploads for anonymous exposure before printing a URL.

Pass --repo when the current checkout is not the PR's repository.
"""

from __future__ import annotations

import json
import mimetypes
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

SUPPORTED = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
TIMEOUT = 30


class AttachmentRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never redirect an upload or forward the GitHub token to a CDN.
        if req.get_method() != "GET" or urlparse(newurl).scheme != "https":
            return None
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None:
            redirected.remove_header("Authorization")
            redirected.remove_header("Cookie")
        return redirected


def resolve_repository(repo: str | None) -> tuple[int, str]:
    if repo is None:
        html_url = run_gh("repo", "view", "--json", "url", "--jq", ".url")
        parsed = urlparse(html_url)
        if parsed.scheme != "https" or parsed.netloc != "github.com":
            raise SystemExit("upload_github_asset: user-attachments upload is github.com-only")
        repo = parsed.path.strip("/")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise SystemExit("upload_github_asset: --repo must be OWNER/REPO on github.com")

    metadata = json.loads(run_gh(
        "api", "--hostname", "github.com", f"repos/{repo}",
        "--jq", "{id, visibility} | @json",
    ))
    repo_id = metadata.get("id")
    visibility = metadata.get("visibility")
    if type(repo_id) is not int or repo_id <= 0:
        raise SystemExit("upload_github_asset: cannot determine repository ID; nothing uploaded")
    if visibility not in {"public", "private", "internal"}:
        raise SystemExit("upload_github_asset: cannot determine repository visibility; nothing uploaded")
    return repo_id, visibility


def fetch_asset(opener, url: str) -> int:
    headers = {"Accept": "image/*", "Cache-Control": "no-cache"}
    request = urllib.request.Request(url, headers=headers)
    try:
        with opener.open(request, timeout=TIMEOUT) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        status = exc.code
        exc.close()
        return status
    except (OSError, urllib.error.URLError) as exc:
        raise SystemExit(
            "upload_github_asset: attachment access check was inconclusive; "
            "keep the local file and do not publish a URL"
        ) from exc


def verify_asset_access(asset_url: str, visibility: str) -> None:
    # Publish the stable GitHub URL, never a signed redirect or a tokenized URL.
    parsed = urlparse(asset_url)
    if (
        parsed.scheme != "https"
        or parsed.netloc != "github.com"
        or not re.fullmatch(r"/user-attachments/assets/[A-Za-z0-9-]+", parsed.path)
        or parsed.query
        or parsed.fragment
        or parsed.params
    ):
        raise SystemExit("upload_github_asset: unexpected attachment URL; do not publish it")
    if visibility not in {"public", "private", "internal"}:
        raise SystemExit("upload_github_asset: cannot verify unknown repository visibility")

    # A repository-scoped 201 confirms upload success. Raw attachment GETs
    # do not necessarily reflect rendering on a PR: public uploads can return
    # 404, and API tokens can receive a browser SSO page for private uploads.
    # Verify rendering separately; do not make either download a posting gate.
    if visibility == "public":
        return

    # A new opener has no cookie jar or cached authenticated session.
    opener = urllib.request.build_opener(AttachmentRedirectHandler())
    anonymous_status = fetch_asset(opener, asset_url)
    if 200 <= anonymous_status < 300:
        raise SystemExit(
            "upload_github_asset: private/internal attachment was anonymously accessible; "
            f"do not publish it. The upload already exists at {asset_url}; "
            "withholding the link does not remove it. Remove it in GitHub or contact GitHub support"
        )
    if anonymous_status not in {401, 403, 404}:
        raise SystemExit(
            "upload_github_asset: anonymous access check was inconclusive "
            f"(HTTP {anonymous_status}); do not publish a URL"
        )


def run_gh(*args: str) -> str:
    result = subprocess.run(
        ["gh", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip() or f"exit {result.returncode}"
        raise SystemExit(f"upload_github_asset: gh {' '.join(args)} failed: {detail}")
    return result.stdout.strip()


def parse_args(argv: list[str]) -> tuple[Path, str | None]:
    path: Path | None = None
    repo: str | None = None
    args = argv[1:]
    i = 0
    while i < len(args):
        if args[i] in ("--repo", "-R"):
            if i + 1 >= len(args):
                raise SystemExit("usage: upload_github_asset.py <file-path> [--repo owner/repo]")
            repo = args[i + 1]
            i += 2
            continue
        if args[i].startswith("-"):
            raise SystemExit(f"upload_github_asset: unknown flag {args[i]}")
        if path is not None:
            raise SystemExit("usage: upload_github_asset.py <file-path> [--repo owner/repo]")
        path = Path(args[i]).expanduser()
        i += 1
    if path is None:
        raise SystemExit("usage: upload_github_asset.py <file-path> [--repo owner/repo]")
    return path, repo


def main() -> None:
    path, repo = parse_args(sys.argv)
    if not path.is_file():
        raise SystemExit(f"upload_github_asset: file not found: {path}")

    suffix = path.suffix.lower()
    mime = SUPPORTED.get(suffix) or mimetypes.guess_type(path.name)[0]
    if mime not in SUPPORTED.values():
        raise SystemExit(
            f"upload_github_asset: unsupported type {suffix or '(none)'}; "
            "use png, jpg, jpeg, gif, or webp"
        )

    repo_id, visibility = resolve_repository(repo)
    token = run_gh("auth", "token", "--hostname", "github.com")

    query = urllib.parse.urlencode(
        {
            "name": path.name,
            "content_type": mime,
            "repository_id": repo_id,
        }
    )
    url = f"https://uploads.github.com/user-attachments/assets?{query}"
    request = urllib.request.Request(
        url,
        data=path.read_bytes(),
        method="POST",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        opener = urllib.request.build_opener(AttachmentRedirectHandler())
        with opener.open(request, timeout=TIMEOUT) as response:
            body = json.loads(response.read().decode("utf-8"))
            status = response.status
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"upload_github_asset: upload failed with HTTP {exc.code}"
        ) from exc
    except (OSError, urllib.error.URLError) as exc:
        raise SystemExit("upload_github_asset: upload could not be confirmed; keep the local file") from exc

    if status != 201:
        raise SystemExit(f"upload_github_asset: upload failed with HTTP {status}")

    asset_url = body.get("url") or body.get("href")
    if not asset_url and isinstance(body.get("asset"), dict):
        asset_url = body["asset"].get("href") or body["asset"].get("url")
    if not isinstance(asset_url, str) or not asset_url:
        raise SystemExit("upload_github_asset: no URL in upload response")

    verify_asset_access(asset_url, visibility)
    print(asset_url)


if __name__ == "__main__":
    main()
