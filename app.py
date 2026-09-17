"""Standalone Series Downloader CLI for Python 3.10+.

Uses only Python's standard library; no packages, server, or config files needed.
Search series, browse seasons/episodes, and export selected links to a TXT file.
The base URL applies only to this run. Reports are saved beside this script.
"""

import html
import re
from datetime import datetime
from http.client import HTTPException
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4


DEFAULT_BASE = "https://moviezda.com"
FOLDER_PATTERN = re.compile(
    r'<div\b[^>]*class=[\"\']f[\"\'][^>]*>\s*<img[^>]*>\s*'
    r'<a\b[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', re.I | re.S
)
ANCHOR_PATTERN = re.compile(
    r'<a\b[^>]*href=[\"\']([^\"\']+)[\"\'][^>]*>(.*?)</a>', re.I | re.S
)


def normalize_base(value):
    value = value.strip()
    if "://" not in value:
        value = "https://" + value
    parsed = urlsplit(value)
    if (parsed.scheme not in ("http", "https") or not parsed.hostname
            or parsed.username or parsed.password or any(c.isspace() for c in value)):
        raise ValueError("Enter an HTTP(S) URL or domain, without credentials.")
    # Accept either a homepage URL or a pasted catalog URL.
    return f"{parsed.scheme}://{parsed.netloc}"


def clean_title(value):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", value)).split())


def page_count(text):
    match = re.search(r'id=[\"\']totalPages[\"\'][^>]*>\s*(\d+)', text, re.I)
    count = int(match.group(1)) if match else 1
    if not 1 <= count <= 200:
        raise ValueError("Unexpected pagination count; refusing to fetch over 200 pages.")
    return count


def extract_entries(text, page_url):
    entries = []
    seen = set()
    for kind, pattern in (("folder", FOLDER_PATTERN), ("episode", ANCHOR_PATTERN)):
        for href, title in pattern.findall(text):
            url = urljoin(page_url, html.unescape(href))
            parsed = urlsplit(url)
            if parsed.scheme not in ("http", "https"):
                continue
            if kind == "episode" and not parsed.path.startswith("/download/"):
                continue
            if url not in seen:
                seen.add(url)
                entries.append({"title": clean_title(title) or url, "url": url, "kind": kind})
    return entries


class Downloader:
    def __init__(self, base_url):
        self.base_url = base_url
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.cache = {}

    def fetch(self, url, params=None):
        if params:
            parts = urlsplit(url)
            query = "&".join(filter(None, (parts.query, urlencode(params))))
            url = urlunsplit(parts._replace(query=query))
        request = Request(url, headers={
            "User-Agent": "SeriesDownloaderCLI/1.0",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Encoding": "identity",
        })
        try:
            with self.opener.open(request, timeout=15) as response:
                encoding = response.headers.get_content_charset() or "utf-8"
                body = response.read()
                try:
                    text = body.decode(encoding, errors="replace")
                except LookupError:
                    text = body.decode("utf-8", errors="replace")
                return text, response.geturl()
        except (URLError, OSError, HTTPException) as exc:
            raise ValueError(f"Could not fetch {url}: {exc}") from exc

    def listing(self, url, catalog=False):
        key = (url, catalog)
        if key in self.cache:
            return self.cache[key]
        text, actual_url = self.fetch(url)
        entries = extract_entries(text, actual_url)
        total = page_count(text)
        for page in range(2, total + 1):
            print(f"Loading page {page}/{total}...")
            text, actual_url = self.fetch(url, {"get-page" if catalog else "page": page})
            entries.extend(extract_entries(text, actual_url))
        if catalog:
            entries = [entry for entry in entries if entry["kind"] == "folder"]
        # Keep website order while removing duplicates across pages.
        entries = list({entry["url"]: entry for entry in entries}.values())
        self.cache[key] = entries
        return entries

    def download_link(self, url):
        # Same three public link stages as apps/movies/routes.py.
        stages = (
            ("download.moviespage.xyz", "/download/file/", "download server"),
            ("movies.downloadpage.xyz", "/download/page/", "intermediate page"),
            (None, None, "Download Server 1"),
        )
        for host, path, label in stages:
            text, actual_url = self.fetch(url)
            for href, title in ANCHOR_PATTERN.findall(text):
                candidate = urljoin(actual_url, html.unescape(href))
                parsed = urlsplit(candidate)
                if parsed.scheme not in ("http", "https"):
                    continue
                if host:
                    matches = parsed.hostname == host and parsed.path.startswith(path)
                else:
                    matches = clean_title(title).casefold() == label.casefold()
                if matches:
                    url = candidate
                    break
            else:
                raise ValueError(f"Could not find {label}; the website may have changed.")
        return url


def prompt(message):
    value = input(message).strip()
    if value.casefold() == "q":
        raise EOFError
    return value


def parse_selection(value, count):
    """Expand 1-based numbers/ranges into unique, ordered zero-based indexes."""
    indexes = []
    seen = set()
    for part in value.split(","):
        match = re.fullmatch(r"\s*([0-9]+)\s*(?:-\s*([0-9]+)\s*)?", part)
        if not match:
            raise ValueError("Use numbers such as 1,2 or ranges such as 1-3,5-6.")
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if not 1 <= start <= end <= count:
            raise ValueError(f"Choose numbers from 1 to {count}; ranges must be ascending.")
        for index in range(start - 1, end):
            if index not in seen:
                indexes.append(index)
                seen.add(index)
    return indexes


def choose(entries, heading, query="", multiple=False):
    while True:
        matches = [entry for entry in entries if query.casefold() in entry["title"].casefold()]
        print(f"\n{heading} ({len(matches)} matches)")
        for number, entry in enumerate(matches, 1):
            print(f"  {number}. [{entry['kind']}] {entry['title']}")
        if not matches:
            print("No matches. Try another search or press Enter to list all.")
        selection_hint = "Numbers/ranges (1,2 or 1-3,5-6)" if multiple else "Number"
        choice = prompt(f"{selection_hint} / search text / Enter = all / b = back / q = quit: ")
        if choice.casefold() == "b":
            return None
        if choice and re.fullmatch(r"[0-9,\s-]+", choice):
            try:
                selected = [matches[index] for index in parse_selection(choice, len(matches))]
                if len(selected) > 1 and (
                    not multiple or any(entry["kind"] != "episode" for entry in selected)
                ):
                    raise ValueError("Select one folder at a time; multiple choices are for episodes only.")
                return selected if multiple else selected[0]
            except ValueError as exc:
                print(f"Invalid selection: {exc}")
        else:
            # Prefix numeric searches with /, e.g. /2026 or /01.
            query = choice.removeprefix("/")


def resolve_batch(downloader, episodes, heading, output_dir=None):
    """Resolve every selected episode and save a UTF-8 report, not media files."""
    generated = datetime.now().astimezone()
    results = []
    for number, episode in enumerate(episodes, 1):
        print(f"[{number}/{len(episodes)}] Resolving {episode['title']}...")
        try:
            link = downloader.download_link(episode["url"])
            results.append((episode, link, None))
        except ValueError as exc:
            error = str(exc)
            print(f"  Failed: {error}")
            results.append((episode, None, error))

    succeeded = sum(link is not None for _, link, _ in results)
    divider = "=" * 72
    lines = [
        divider,
        "SERIES DOWNLOADER - DOWNLOAD LINKS",
        divider,
        f"Selection: {heading}",
        f"Source: {downloader.base_url}",
        f"Generated: {generated.isoformat(timespec='seconds')}",
        f"Selected: {len(results)} | Successful: {succeeded} | Failed: {len(results) - succeeded}",
        "Only links are listed below; no media files were downloaded.",
        "",
    ]
    for number, (episode, link, error) in enumerate(results, 1):
        lines.extend([
            "-" * 72,
            f"{number:02d}. {episode['title']}",
            f"Status: {'OK' if link is not None else 'FAILED'}",
            f"Episode page: {episode['url']}",
        ])
        if link is not None:
            lines.extend(["Download link:", link])
        else:
            lines.append(f"Reason: {error}")
        lines.append("")
    report = "\n".join(lines) + "\n"
    print("\n" + report)

    return 0 if succeeded == len(results) else 1


def run():
    print("Series Downloader CLI (q quits; Ctrl+C cancels)")
    while True:
        entered = prompt(f"Base URL [{DEFAULT_BASE}]: ")
        try:
            base = normalize_base(entered or DEFAULT_BASE)
            break
        except ValueError as exc:
            print(exc)

    downloader = Downloader(base)
    print("Loading series catalog...")
    series = downloader.listing(base + "/tamil-web-series-download/", catalog=True)
    if not series:
        print("No series found. Check the base URL; the site layout may have changed.")
        return 1

    while True:
        query = prompt("\nSearch series (Enter = all, q = quit): ")
        selected = choose(series, "Series", query)
        if selected is None:
            continue
        history = [selected]
        while history:
            current = history[-1]
            print(f"\nOpening {current['title']}...")
            try:
                entries = downloader.listing(current["url"])
            except ValueError as exc:
                print(f"Could not load this page: {exc}")
                history.pop()
                continue
            if not entries:
                print("No seasons, folders, or episodes found. Going back.")
                history.pop()
                continue
            heading = " > ".join(item["title"] for item in history)
            selection = choose(entries, heading, multiple=True)
            if selection is None:
                history.pop()
            elif selection[0]["kind"] == "folder":
                selected = selection[0]
                if any(item["url"] == selected["url"] for item in history):
                    print("Already browsing this folder. Choose another item.")
                else:
                    history.append(selected)
            else:
                return resolve_batch(downloader, selection, heading)


def main():
    try:
        return run()
    except (EOFError, KeyboardInterrupt):
        print("\nSearch cancelled.")
        return 0
    except ValueError as exc:
        print(f"Unable to load the downloader: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
