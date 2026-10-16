#!/usr/bin/env python3
"""Preview one of the sites under a different business name.

    python3 scripts/rename_preview.py orchards "Halecat Orchards"

writes previews/halecat-orchards/index.html: the current page, with the name
swapped everywhere a visitor would read it, and a banner saying it is a
preview. Email addresses, web links and photo descriptions of existing labels
are left alone. Previews are never indexed by search engines.

Run scripts/sync.py first so the copy carries the latest shared blocks.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CURRENT = {
    "orchards": "Witherslack Orchards",
    "woodlands": "Witherslack Woodlands",
    "halecat": "Halecat House",
}

# Photos show the real labels, so their descriptions must keep the real name.
KEEP_IN_ALT = {
    "A bottle of Witherslack Orchards Damson Gin liqueur on a table": "A bottle of our Damson Gin liqueur on a table",
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in CURRENT:
        sys.exit(f"usage: rename_preview.py {{{','.join(CURRENT)}}} \"New Name\"")
    site, new_name = sys.argv[1], sys.argv[2]
    old_name = CURRENT[site]

    html = (ROOT / site / "index.html").read_text(encoding="utf-8")
    for old, new in KEEP_IN_ALT.items():
        html = html.replace(old, new)
    html = html.replace(old_name, new_name)

    # The copy sits one folder deeper, so shared files are one more level up.
    html = html.replace('"../', '"../../')

    banner = (
        '<div class="preview-banner">Preview only: how '
        f"{old_name} would look as {new_name}. Not a live website.</div>"
    )
    html = html.replace("<body ", '<body data-preview="1" ', 1)
    html = re.sub(r"(<a class=\"skip\"[^>]*>[^<]*</a>)", r"\1\n" + banner, html, count=1)
    html = html.replace(
        '<meta name="viewport"',
        '<meta name="robots" content="noindex, nofollow">\n  <meta name="viewport"',
        1,
    )

    out = ROOT / "previews" / slug(new_name) / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
