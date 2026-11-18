"""Calcula la referencia local a partir de StatsBomb Open Data."""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from statistics import mean, median
from urllib.parse import quote
from urllib.request import urlopen


REVISION = "4b73468fc5b0f1950f9f66fada70ad3a4f9327cb"
BASE = f"https://raw.githubusercontent.com/hudl/open-data/{REVISION}"
PUBLIC = Path(__file__).resolve().parent / "public"


def download(path):
    with urlopen(f"{BASE}/{quote(path)}", timeout=30) as response:
        return response.read()


def shots_in_match(match):
    events = json.loads(download(f"data/events/{match['match_id']}.json"))
    return [
        event["shot"]["statsbomb_xg"]
        for event in events
        if event["type"]["name"] == "Shot"
        and event["period"] in (1, 2, 3, 4)
        and event["shot"]["type"]["name"] != "Penalty"
    ]


def main():
    matches = json.loads(download("data/matches/43/106.json"))
    if len(matches) != 64:
        raise ValueError("La referencia debe cubrir los 64 partidos del Mundial 2022.")
    with ThreadPoolExecutor(max_workers=8) as pool:
        values = [value for group in pool.map(shots_in_match, matches) for value in group]
    summary = {
        "revision": REVISION,
        "matches": len(matches),
        "shots": len(values),
        "meanXg": round(mean(values), 4),
        "medianXg": round(median(values), 4),
    }
    logo = download("img/SB - Icon Lockup - Colour positive.png")
    (PUBLIC / "statsbomb.png").write_bytes(logo)
    (PUBLIC / "referencia.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
