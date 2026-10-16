#!/usr/bin/env python3
"""Keep the shared estate elements identical across every site.

Each page carries marker comments such as

    <!-- @estate-bar halecat -->
    ...generated...
    <!-- /@estate-bar -->

Running `python3 scripts/sync.py` rewrites everything between the markers
from the definitions below, and regenerates vercel.json so each domain serves
its own folder. Edit the shared pieces here, never by hand in the pages.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The estate and its businesses. Order here is the order everywhere.
SITES = {
    "estate": {
        "name": "Witherslack Hall Estate",
        "short": "The Estate",
        "domain": "witherslackestate.co.uk",
        "line": "800 hectares on the edge of the Winster Valley",
    },
    "halecat": {
        "name": "Halecat House",
        "short": "Halecat",
        "domain": "halecat.co.uk",
        "line": "Our late Georgian family house, sleeps eleven, dogs welcome",
        "image": "halecat-house.jpg",
        "alt": "Smoke bush leaves in autumn against the stone front of Halecat House",
    },
    "woodlands": {
        "name": "Witherslack Woodlands",
        "short": "Woodlands",
        "domain": "witherslackwoodlands.co.uk",
        "line": "Air dried logs from our own woods, delivered across South Cumbria",
        "image": "woodlands-landrover.jpg",
        "alt": "The Witherslack Woodlands Land Rover outside the timber woodshed",
    },
    "orchards": {
        "name": "Witherslack Orchards",
        "short": "Orchards",
        "domain": "witherslackorchards.co.uk",
        "line": "Apple juice, apple and damson juice and damson gin, made at Halecat",
        "image": "orchards-damsons.jpg",
        "alt": "A wicker basket full of freshly picked Witherslack damsons",
    },
}
BUSINESSES = ["halecat", "woodlands", "orchards"]

ADDRESS = "Halecat, Witherslack, Grange-over-Sands, Cumbria LA11 6RT"

# One ring, four centres. The ring is the estate; the centre is the business.
RING = (
    '<circle cx="24" cy="24" r="22.5" fill="none" stroke="currentColor" stroke-width="1.5"/>'
    '<circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="0.6"/>'
)
CENTRES = {
    "estate": '<path d="M11 31 L18 23 L22.5 27 L29.5 16.5 L37 31" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 34.5 H35" stroke="currentColor" stroke-width="1.2"/>',
    "halecat": '<path d="M15 33 V21.5 L24 14 L33 21.5 V33 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M21.5 33 V27 H26.5 V33" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M19 22.5 h2.5 M26.5 22.5 h2.5" stroke="currentColor" stroke-width="1.4"/>',
    "woodlands": '<path d="M24 12.5 L31.5 22 H27.5 L33.5 29.5 H14.5 L20.5 22 H16.5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M24 29.5 V35.5" stroke="currentColor" stroke-width="1.6"/>',
    "orchards": '<path d="M24 19.5 C20 16.5 14.5 18 14.5 24.5 C14.5 30.5 19 35.5 24 33.8 C29 35.5 33.5 30.5 33.5 24.5 C33.5 18 28 16.5 24 19.5 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M24 19.5 C24 16.5 25 14.5 27 13" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M25.5 15.5 C28 13 31.5 13.5 32.5 14.5 C30.5 16.5 27.5 16.8 25.5 15.5 Z" fill="currentColor"/>',
}


def sprite(_arg):
    symbols = "".join(
        f'<symbol id="mark-{key}" viewBox="0 0 48 48">{RING}{centre}</symbol>'
        for key, centre in CENTRES.items()
    )
    return f'<svg width="0" height="0" style="position:absolute" aria-hidden="true">{symbols}</svg>'


def mark(key, cls=""):
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} aria-hidden="true"><use href="#mark-{key}"/></svg>'


def estate_bar(current):
    items = []
    for key in BUSINESSES:
        cur = ' aria-current="page"' if key == current else ""
        items.append(
            f'<li><a class="is-{key}" href="../{key}/"{cur}>{SITES[key]["short"]}</a></li>'
        )
    home_cur = ' aria-current="page"' if current == "estate" else ""
    return (
        '<div class="estate-bar"><div class="wrap">'
        f'<a class="estate-bar__home" href="../estate/"{home_cur}><span class="estate-bar__full">Witherslack Hall Estate<span> &middot; Southern Lakeland</span></span><span class="estate-bar__short">The Estate</span></a>'
        f'<ul aria-label="Businesses on the estate">{"".join(items)}</ul>'
        "</div></div>"
    )


def family(current):
    others = [k for k in BUSINESSES if k != current]
    doors = []
    for key in others:
        s = SITES[key]
        doors.append(
            f'<a class="door is-{key}" href="../{key}/">'
            f'<img src="../assets/img/{s["image"]}" alt="{s["alt"]}" loading="lazy">'
            f'<div class="door__body"><div class="door__head">{mark(key)}<h3>{s["name"]}</h3></div>'
            f'<p>{s["line"]}.</p><span class="door__go">Visit {s["short"]}</span></div></a>'
        )
    return (
        '<section class="section section--tint" aria-labelledby="family-title"><div class="wrap">'
        '<span class="eyebrow">Also on the estate</span>'
        '<h2 id="family-title">Our neighbours at Halecat</h2>'
        '<p class="lede">The house, the woodyard and the orchards all sit on the same estate, a few minutes\' walk apart. '
        '<a href="../estate/">More about Witherslack Hall Estate</a>.</p>'
        f'<div class="doors doors--compact">{"".join(doors)}</div>'
        "</div></section>"
    )


def footer(current):
    links = "".join(
        f'<li><a href="../{k}/">{SITES[k]["name"]}</a></li>' for k in BUSINESSES
    )
    return (
        '<footer class="site-footer"><div class="wrap"><div class="footer-grid">'
        f'<div class="footer-brand">{mark("estate")}<div><strong>Witherslack Hall Estate</strong>'
        "<p>800 hectares between the River Winster and Whitbarrow Scar, and the largest area of "
        "semi natural woodland in Cumbria.</p></div></div>"
        f'<div><h4>The estate</h4><ul><li><a href="../estate/">Estate home</a></li>{links}</ul></div>'
        f'<div><h4>Find us</h4><p>{ADDRESS.replace(", ", ",<br>")}</p></div>'
        '<div><h4>Estate office</h4><ul><li><a href="tel:+441539552387">015395 52387</a></li>'
        '<li><a href="../estate/#contact">All contacts</a></li></ul></div>'
        "</div>"
        '<div class="footer-base"><span>&copy; <span data-year>2026</span> Witherslack Hall Estate</span>'
        "<span>Witherslack, Grange-over-Sands, Cumbria</span></div>"
        "</div></footer>"
    )


BLOCKS = {"sprite": sprite, "estate-bar": estate_bar, "family": family, "footer": footer}
PATTERN = re.compile(r"<!-- @([a-z-]+)(?: ([a-z]+))? -->.*?<!-- /@\1 -->", re.S)


def render(match):
    name, arg = match.group(1), match.group(2)
    if name not in BLOCKS:
        return match.group(0)
    open_tag = f"<!-- @{name} {arg} -->" if arg else f"<!-- @{name} -->"
    return f"{open_tag}\n{BLOCKS[name](arg)}\n<!-- /@{name} -->"


def vercel_config():
    """Each domain serves its own folder; links to a sister site leave for its domain."""
    redirects, rewrites = [], []
    hosts = {k: SITES[k]["domain"] for k in SITES}
    for key, domain in hosts.items():
        host_match = [{"type": "host", "value": f"(?:www\\.)?{re.escape(domain)}"}]
        for other, other_domain in hosts.items():
            target = "/" if other == key else f"https://{other_domain}/"
            redirects.append({
                "source": f"/{other}/:path*",
                "has": host_match,
                "destination": target if other != key else "/:path*",
                "permanent": True,
            })
        rewrites.append({"source": "/assets/:path*", "has": host_match, "destination": "/assets/:path*"})
        rewrites.append({"source": "/api/:path*", "has": host_match, "destination": "/api/:path*"})
        rewrites.append({"source": "/:path*", "has": host_match, "destination": f"/{key}/:path*"})
    # Previews and any unmatched host land on the estate home.
    known = "|".join(re.escape(d) for d in hosts.values())
    redirects.append({
        "source": "/",
        "missing": [{"type": "host", "value": f"(?:www\\.)?(?:{known})"}],
        "destination": "/estate/",
        "permanent": False,
    })
    return {"cleanUrls": True, "trailingSlash": True, "redirects": redirects, "rewrites": rewrites}


def main():
    pages = sorted(ROOT.glob("*/index.html"))
    for page in pages:
        text = page.read_text(encoding="utf-8")
        new = PATTERN.sub(render, text)
        if new != text:
            page.write_text(new, encoding="utf-8")
            print(f"updated {page.relative_to(ROOT)}")
    (ROOT / "vercel.json").write_text(json.dumps(vercel_config(), indent=2) + "\n", encoding="utf-8")
    print("wrote vercel.json")


if __name__ == "__main__":
    main()
