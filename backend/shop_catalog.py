"""
Shop catalog: profile icons. Prices and emoji are server-defined only.
"""

from __future__ import annotations

# (icon_key, display emoji, price in beatbucks)
PROFILE_ICON_ITEMS: list[tuple[str, str, int]] = [
    ("skull", "\N{SKULL}", 50),
    ("hundred", "\N{HUNDRED POINTS SYMBOL}", 50),
    ("money_wings", "\N{MONEY WITH WINGS}", 50),
    ("cold_face", "\N{FREEZING FACE}", 50),
    ("fire", "\N{FIRE}", 50),
    ("note", "\N{EIGHTH NOTE}", 50),
]

_PROFILE_ICON_META: dict[str, tuple[str, int]] = {
    k: (emoji, price) for k, emoji, price in PROFILE_ICON_ITEMS
}


def is_valid_icon_key(icon_key: str) -> bool:
    return icon_key in _PROFILE_ICON_META


def price_for_icon(icon_key: str) -> int:
    return _PROFILE_ICON_META[icon_key][1]


def emoji_for_icon_key(icon_key: str | None) -> str | None:
    if not icon_key:
        return None
    meta = _PROFILE_ICON_META.get(icon_key)
    return meta[0] if meta else None


def catalog_public_list() -> list[dict[str, str | int]]:
    return [
        {"icon_key": key, "emoji": emoji, "price": price}
        for key, emoji, price in PROFILE_ICON_ITEMS
    ]
