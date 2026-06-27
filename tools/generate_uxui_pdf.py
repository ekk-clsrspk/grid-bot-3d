from __future__ import annotations

import base64
import html
import shutil
import subprocess
import sys
from io import BytesIO
from pathlib import Path

import qrcode
from PIL import Image, ImageOps


CONFIG = {
    "student_name": "Ekkaratch Chalongsirisophakul",
    "student_id": "1690900475",
    "university": "Bangkok University",
    "site_url": "https://gridbot.aek-lab.space",
    "admin_user": "admin",
    "admin_pass": "admin@aek-lab.space",
    "context": "Robot Training Program",
    "html_output": "gridbot_uxui_redesign.html",
    "pdf_output": "GridBot3D_UXUI_Redesign_Aekarach_1690900475.pdf",
}

ROOT = Path(__file__).resolve().parents[1]
PRESENTATION_DIR = ROOT / "presentation"
ASSET_DIR = PRESENTATION_DIR / "assets"
SCREENSHOT_DIR = ROOT / ".tmp" / "live_screenshots"


def escape_html(text: object) -> str:
    return html.escape(str(text), quote=True)


def image_data_uri(
    path: Path,
    *,
    max_width: int = 980,
    quality: int = 76,
    grayscale: bool = True,
    crop: tuple[int, int, int, int] | None = None,
) -> str:
    image = Image.open(path).convert("RGB")
    if crop:
        image = image.crop(crop)
    if grayscale:
        image = ImageOps.grayscale(image).convert("RGB")
    if image.width > max_width:
        next_height = round(image.height * (max_width / image.width))
        image = image.resize((max_width, next_height), Image.Resampling.LANCZOS)

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def qr_data_uri(value: str) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(value)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#111111", back_color="#ffffff").convert("RGB")
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def find_chrome() -> str | None:
    known_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ]

    for candidate in known_paths:
        if Path(candidate).exists():
            return candidate

    for command in (
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "brave-browser",
        "microsoft-edge",
    ):
        resolved = shutil.which(command)
        if resolved:
            return resolved

    return None


def screenshot_path(name: str) -> Path:
    fresh_capture = SCREENSHOT_DIR / name
    existing_asset = ASSET_DIR / name
    if fresh_capture.exists():
        return fresh_capture
    if existing_asset.exists():
        return existing_asset
    raise FileNotFoundError(f"Missing screenshot: {name}")


def pill(text: str) -> str:
    return f'<span class="pill">{escape_html(text)}</span>'


def item(title: str, body: str) -> str:
    return f"""
    <article class="item">
        <h3>{escape_html(title)}</h3>
        <p>{escape_html(body)}</p>
    </article>
    """


def check(text: str) -> str:
    return f'<div class="check"><span>OK</span>{escape_html(text)}</div>'


def stat(value: str, label: str) -> str:
    return f"""
    <div class="stat">
        <strong>{escape_html(value)}</strong>
        <span>{escape_html(label)}</span>
    </div>
    """


def build_html() -> str:
    site_url = str(CONFIG["site_url"])
    qr_image = qr_data_uri(site_url)
    board_image = image_data_uri(
        screenshot_path("04-gameplay-run.png"),
        max_width=900,
        quality=74,
        grayscale=False,
        crop=(70, 120, 980, 760),
    )
    full_game_image = image_data_uri(
        screenshot_path("04-gameplay-run.png"),
        max_width=980,
        quality=76,
        grayscale=False,
        crop=(70, 120, 980, 760),
    )

    student_name = escape_html(CONFIG["student_name"])
    student_id = escape_html(CONFIG["student_id"])
    university = escape_html(CONFIG["university"])
    site_url_html = escape_html(site_url)
    admin_user = escape_html(CONFIG["admin_user"])
    admin_pass = escape_html(CONFIG["admin_pass"])

    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Grid Bot 3D UX/UI Redesign</title>
    <style>
        :root {{
            --black: #111111;
            --gray-900: #1a1a1a;
            --gray-800: #2a2a2a;
            --gray-700: #444444;
            --gray-500: #777777;
            --gray-300: #d8d8d8;
            --gray-200: #ebebeb;
            --gray-100: #f5f5f5;
            --white: #ffffff;
        }}

        @page {{
            size: 13.333in 7.5in;
            margin: 0;
        }}

        * {{
            box-sizing: border-box;
        }}

        html,
        body {{
            margin: 0;
            padding: 0;
            background: var(--white);
            color: var(--black);
            font-family: Arial, Helvetica, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }}

        body {{
            font-size: 15px;
            line-height: 1.38;
        }}

        .slide {{
            width: 13.333in;
            height: 7.5in;
            padding: 0.42in;
            position: relative;
            overflow: hidden;
            page-break-after: always;
            background: var(--gray-100);
        }}

        .slide.dark {{
            color: var(--white);
            background: var(--black);
        }}

        .slide:last-child {{
            page-break-after: auto;
        }}

        .slide::after {{
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 7px;
            background: var(--gray-800);
        }}

        .dark::after {{
            background: var(--gray-300);
        }}

        .page-no,
        .footer {{
            position: absolute;
            bottom: 0.15in;
            font-size: 10px;
            color: var(--gray-500);
            font-weight: 700;
        }}

        .page-no {{
            right: 0.42in;
        }}

        .footer {{
            left: 0.42in;
        }}

        .dark .page-no,
        .dark .footer {{
            color: var(--gray-300);
        }}

        .header {{
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            margin-bottom: 20px;
        }}

        .label {{
            margin-bottom: 7px;
            color: var(--gray-600, #666);
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0;
        }}

        .dark .label {{
            color: var(--gray-300);
        }}

        h1,
        h2,
        h3,
        p {{
            margin: 0;
        }}

        h1 {{
            font-size: 52px;
            line-height: 0.98;
            font-weight: 800;
            letter-spacing: 0;
        }}

        h2 {{
            font-size: 34px;
            line-height: 1.08;
            font-weight: 800;
            letter-spacing: 0;
        }}

        h3 {{
            font-size: 17px;
            line-height: 1.2;
            font-weight: 800;
            letter-spacing: 0;
        }}

        p,
        li {{
            color: var(--gray-700);
            font-size: 14px;
            line-height: 1.46;
        }}

        .dark p,
        .dark li {{
            color: var(--gray-300);
        }}

        ul {{
            margin: 10px 0 0;
            padding-left: 19px;
        }}

        a {{
            color: inherit;
            text-decoration: none;
        }}

        .grid {{
            display: grid;
            gap: 14px;
        }}

        .two-col {{
            grid-template-columns: 0.96fr 1.04fr;
        }}

        .three-col {{
            grid-template-columns: repeat(3, 1fr);
        }}

        .two-by-two {{
            grid-template-columns: repeat(2, 1fr);
        }}

        .card,
        .item,
        .check,
        .stat,
        .shot,
        .qr-card {{
            border: 1px solid var(--gray-300);
            border-radius: 8px;
            background: var(--white);
            padding: 17px;
        }}

        .dark .card,
        .dark .item,
        .dark .stat,
        .dark .shot,
        .dark .qr-card {{
            border-color: var(--gray-700);
            background: var(--gray-900);
        }}

        .pill-row {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 14px;
        }}

        .pill {{
            display: inline-flex;
            align-items: center;
            min-height: 28px;
            padding: 5px 10px;
            border-radius: 999px;
            border: 1px solid var(--gray-300);
            background: var(--white);
            color: var(--black);
            font-size: 12px;
            font-weight: 800;
        }}

        .dark .pill {{
            border-color: var(--gray-700);
            background: var(--gray-800);
            color: var(--white);
        }}

        .hero-grid {{
            grid-template-columns: 1.05fr 0.95fr;
            align-items: stretch;
        }}

        .title-area {{
            display: flex;
            flex-direction: column;
            gap: 14px;
        }}

        .student-card {{
            width: 350px;
        }}

        .student-card strong {{
            display: block;
            margin-top: 4px;
            font-size: 18px;
        }}

        .student-card span {{
            display: block;
            margin-top: 3px;
            color: var(--gray-500);
            font-size: 13px;
        }}

        .dark .student-card span {{
            color: var(--gray-300);
        }}

        .shot {{
            padding: 8px;
            overflow: hidden;
        }}

        .shot img {{
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 5px;
            filter: contrast(1.04);
        }}

        .shot-hero {{
            height: 345px;
        }}

        .shot-wide {{
            height: 460px;
        }}

        .shot-small {{
            height: 166px;
        }}

        .stat-row {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-top: 12px;
        }}

        .stat {{
            min-height: 76px;
        }}

        .stat strong {{
            display: block;
            margin-bottom: 5px;
            font-size: 26px;
            line-height: 1;
        }}

        .stat span {{
            color: var(--gray-500);
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
        }}

        .dark .stat span {{
            color: var(--gray-300);
        }}

        .item {{
            min-height: 120px;
        }}

        .item h3 {{
            margin-bottom: 7px;
        }}

        .reference {{
            min-height: 176px;
        }}

        .url {{
            margin-top: 10px;
            color: var(--gray-500);
            font-size: 11px;
            word-break: break-all;
        }}

        .principle {{
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--gray-700);
        }}

        .principle:last-child {{
            border-bottom: 0;
        }}

        .principle strong {{
            font-size: 15px;
        }}

        .principle span {{
            max-width: 180px;
            color: var(--gray-300);
            font-size: 12px;
            text-align: right;
        }}

        .mockup-grid {{
            grid-template-columns: 1.15fr 0.85fr;
            align-items: stretch;
        }}

        .annotation {{
            border: 1px solid var(--gray-300);
            border-radius: 8px;
            background: var(--white);
            padding: 13px 14px;
        }}

        .annotation h3 {{
            margin-bottom: 5px;
            font-size: 15px;
        }}

        .annotation p {{
            font-size: 12.5px;
        }}

        .change-row {{
            padding: 12px 0;
            border-bottom: 1px solid var(--gray-700);
        }}

        .change-row:last-child {{
            border-bottom: 0;
        }}

        .change-row b {{
            display: block;
            margin-bottom: 4px;
            color: var(--white);
            font-size: 14px;
        }}

        .prompt-box {{
            border: 1px solid var(--gray-700);
            border-radius: 8px;
            background: #0a0a0a;
            padding: 16px;
            color: var(--white);
            font-size: 14px;
            line-height: 1.55;
        }}

        .check-grid {{
            grid-template-columns: repeat(2, 1fr);
        }}

        .check {{
            display: flex;
            align-items: flex-start;
            gap: 9px;
            padding: 10px 12px;
            font-size: 13px;
        }}

        .check span {{
            color: var(--black);
            font-weight: 800;
        }}

        .rubric {{
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 10px;
            margin-top: 12px;
        }}

        .rubric div {{
            min-height: 86px;
            border: 1px solid var(--gray-300);
            border-radius: 8px;
            background: var(--white);
            padding: 12px;
        }}

        .rubric strong {{
            display: block;
            margin-bottom: 6px;
            color: var(--black);
            font-size: 20px;
            line-height: 1;
        }}

        .rubric span {{
            display: block;
            color: var(--gray-700);
            font-size: 12px;
            line-height: 1.3;
        }}

        .access-grid {{
            grid-template-columns: 1fr 265px;
            align-items: stretch;
        }}

        .qr-card {{
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }}

        .qr-card img {{
            width: 170px;
            height: 170px;
            image-rendering: pixelated;
        }}

        .credential-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 12px;
        }}

        .credential {{
            border: 1px solid var(--gray-300);
            border-radius: 8px;
            background: var(--gray-100);
            padding: 12px;
        }}

        .credential span {{
            display: block;
            margin-bottom: 4px;
            color: var(--gray-500);
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
        }}

        .credential strong {{
            display: block;
            color: var(--black);
            font-size: 17px;
            word-break: break-all;
        }}
    </style>
</head>
<body>
    <section class="slide dark">
        <div class="header">
            <div class="title-area">
                <div class="label">UX/UI Activity 2026</div>
                <h1>Grid Bot 3D Redesign Challenge</h1>
                <p>A UX/UI redesign proposal for Grid Bot Challenge, reframed as a 3D robot training environment for beginners learning logic, sequencing, and debugging.</p>
                <div class="pill-row">
                    {pill("Robot Training Program")}
                    {pill("3D Mission Board")}
                    {pill("Command Console")}
                    {pill("Progress Sync")}
                </div>
                <div class="card">
                    <h3>Selected Context</h3>
                    <p>A robot training lab for students and first-time coders who need a clear, low-friction way to test route commands and understand immediate feedback.</p>
                </div>
                <div class="stat-row">
                    {stat("4", "Missions")}
                    {stat("5-14", "Grid Range")}
                    {stat("2", "Core Surfaces")}
                    {stat("API", "Validated Runs")}
                </div>
            </div>
            <div>
                <div class="card student-card">
                    <span>Prepared by</span>
                    <strong>{student_name}</strong>
                    <span>Student ID {student_id}</span>
                    <span>{university}</span>
                </div>
                <div class="shot shot-hero"><img src="{board_image}" alt="Grid Bot 3D board screenshot"></div>
            </div>
        </div>
        <div class="footer">GE011 - W3.2 UX/UI Design</div>
        <div class="page-no">01 / 08</div>
    </section>

    <section class="slide dark">
        <div class="header">
            <div>
                <div class="label">Slide 2</div>
                <h2>Users and Problem Framing</h2>
            </div>
            {pill("Good UX starts with a specific user")}
        </div>
        <div class="grid two-col">
            <div class="card">
                <h3>Primary User</h3>
                <p>Students or new coders who are learning how a sequence of commands changes the position of an object on a grid.</p>
                <ul>
                    <li>They need to see the start point, goal, blocked areas, and current robot state.</li>
                    <li>They need to test commands repeatedly without feeling punished for mistakes.</li>
                    <li>They need clear step count, par target, run state, and submit state.</li>
                </ul>
                <div class="shot shot-small"><img src="{board_image}" alt="Grid board screenshot crop"></div>
            </div>
            <div class="grid two-by-two">
                {item("Problem 1: Abstract Grid", "The original grid mechanic works, but it needs stronger context so the task feels purposeful.")}
                {item("Problem 2: Direction Confusion", "A 3D camera can make up, down, left, and right harder to interpret without a board direction guide.")}
                {item("Problem 3: Weak Feedback Loops", "The user must know whether the program is ready, running, valid, blocked, or submittable.")}
                {item("Problem 4: Trust in Progress", "Login, synced progress, and server-side run validation make completion and scoring more reliable.")}
            </div>
        </div>
        <div class="footer">Project read: static frontend plus Rust and SQLite API</div>
        <div class="page-no">02 / 08</div>
    </section>

    <section class="slide">
        <div class="header">
            <div>
                <div class="label">Slide 3</div>
                <h2>References and Design Inspiration</h2>
            </div>
            {pill("Minimum three sources")}
        </div>
        <div class="grid two-by-two">
            <article class="item reference"><h3>NN/g - 10 Usability Heuristics</h3><p>Used to evaluate system status, consistency, error prevention, recognition over recall, and immediate feedback.</p><div class="url">https://www.nngroup.com/articles/ten-usability-heuristics/</div></article>
            <article class="item reference"><h3>Google Material Design 3</h3><p>Used for component hierarchy, state clarity, expressive layout, predictable controls, and restrained interaction surfaces.</p><div class="url">https://m3.material.io/</div></article>
            <article class="item reference"><h3>W3C WCAG 2.2</h3><p>Used to check readable text, contrast, labels, keyboard-friendly controls, and touch target clarity.</p><div class="url">https://www.w3.org/TR/WCAG22/</div></article>
            <article class="item reference"><h3>Three.js WebGL Library</h3><p>The project uses Three.js, OrbitControls, and GLTFLoader to create an interactive board that can be rotated and zoomed.</p><div class="url">https://threejs.org/</div></article>
        </div>
        <div class="footer">References applied to UX rationale, visual system, accessibility, and 3D interaction</div>
        <div class="page-no">03 / 08</div>
    </section>

    <section class="slide dark">
        <div class="header">
            <div>
                <div class="label">Slide 4</div>
                <h2>Redesign Direction</h2>
            </div>
            {pill("Monotone product presentation")}
        </div>
        <div class="grid three-col">
            <article class="card">
                <h3>Mood and Theme</h3>
                <p>A disciplined robot training interface: dark graphite surfaces, white cards, gray dividers, and color removed from decoration so hierarchy comes from scale and contrast.</p>
                <div class="pill-row">
                    {pill("Graphite")}
                    {pill("White")}
                    {pill("Soft Gray")}
                    {pill("No Neon")}
                </div>
            </article>
            <article class="card">
                <h3>Information Architecture</h3>
                <p>The mission menu shows overview and progress. The gameplay screen focuses on the 3D board, command console, route testing, and submission state.</p>
                <ul>
                    <li>Account details stay in a compact popover.</li>
                    <li>Admin tools are separated into a control room.</li>
                    <li>High-level KPIs are not repeated on every surface.</li>
                </ul>
            </article>
            <article class="card">
                <div class="principle"><strong>Clarity</strong><span>Goal, route, and commands are visible.</span></div>
                <div class="principle"><strong>Consistency</strong><span>Controls share one visual language.</span></div>
                <div class="principle"><strong>Feedback</strong><span>Run state and errors are explicit.</span></div>
                <div class="principle"><strong>Hierarchy</strong><span>Board and console are the main focus.</span></div>
                <div class="principle"><strong>Accessibility</strong><span>Readable labels and reset controls.</span></div>
            </article>
        </div>
        <div class="footer">The visual design is intentionally monotone to reduce noise and emphasize task flow</div>
        <div class="page-no">04 / 08</div>
    </section>

    <section class="slide">
        <div class="header">
            <div>
                <div class="label">Slide 5</div>
                <h2>Mockup from the Live Product</h2>
            </div>
            {pill("Captured from the real web app")}
        </div>
        <div class="grid mockup-grid">
            <div class="shot shot-wide"><img src="{full_game_image}" alt="Grid Bot 3D gameplay screenshot"></div>
            <div class="grid">
                <article class="annotation"><h3>3D Mission Board</h3><p>The play area becomes a training field with visible start, goal, obstacles, and robot position.</p></article>
                <article class="annotation"><h3>Command Console</h3><p>The command input is separated from the board and supports line count, run state, and submit state.</p></article>
                <article class="annotation"><h3>Status and Direction</h3><p>Steps, par, status, board direction, and reset angle reduce confusion during testing.</p></article>
                <article class="annotation"><h3>Validated Progress</h3><p>Successful runs unlock missions and can be submitted to the backend for validation.</p></article>
            </div>
        </div>
        <div class="footer">Live product: {site_url_html}</div>
        <div class="page-no">05 / 08</div>
    </section>

    <section class="slide dark">
        <div class="header">
            <div>
                <div class="label">Slide 6</div>
                <h2>What Changed from the Original Game</h2>
            </div>
            {pill("Original core versus redesigned UX")}
        </div>
        <div class="grid two-col">
            <article class="card">
                <h3>Core Mechanics Kept</h3>
                <div class="change-row"><b>Grid, start, goal, and obstacles</b><p>The player still moves a robot from the start cell to the goal while avoiding blocked cells.</p></div>
                <div class="change-row"><b>Command-based movement</b><p>The learning model still depends on ordered commands such as up, down, left, and right.</p></div>
                <div class="change-row"><b>Steps and par</b><p>Performance is still measured by route length and efficiency.</p></div>
                <div class="change-row"><b>Run and submit</b><p>The player still tests a route before submitting a completed solution.</p></div>
            </article>
            <article class="card">
                <h3>Redesigned for the New Context</h3>
                <div class="change-row"><b>Flat grid to 3D training board</b><p>The interface adds spatial context while keeping the command logic intact.</p></div>
                <div class="change-row"><b>Scattered information to mission cards</b><p>Mission number, grid size, par, difficulty, and progress are grouped before gameplay starts.</p></div>
                <div class="change-row"><b>Generic buttons to stateful controls</b><p>Run, submit, status, and toast feedback make the system state easier to understand.</p></div>
                <div class="change-row"><b>Local play to account-based progress</b><p>The Rust and SQLite API stores accounts, progress, submissions, and server-side validation.</p></div>
            </article>
        </div>
        <div class="footer">The redesign preserves the learning mechanic while improving context, feedback, and trust</div>
        <div class="page-no">06 / 08</div>
    </section>

    <section class="slide dark">
        <div class="header">
            <div>
                <div class="label">Slide 7</div>
                <h2>AI Prompt and Usage Disclosure</h2>
            </div>
            {pill("AI used as an assistant")}
        </div>
        <div class="grid two-col">
            <article class="card">
                <h3>Example Prompt Used</h3>
                <div class="prompt-box">
                    Analyze the Grid Bot 3D project and create an English UX/UI redesign slide deck for GE011 W3.2. Use the Robot Training Program context for beginner coders, keep the core mechanics such as grid, start, goal, obstacles, command input, Run, Submit, steps, and feedback, explain the UX/UI rationale, generate a QR code for the live site, include admin credentials for review, and export the deck as a PDF from HTML.
                </div>
            </article>
            <article class="card">
                <h3>How AI Helped</h3>
                <ul>
                    <li>Extracted requirements from the professor's image-based PDF using OCR.</li>
                    <li>Read the project structure and summarized the product flow.</li>
                    <li>Organized UX reasoning against the grading rubric.</li>
                    <li>Generated a lightweight HTML-to-PDF script and QR code asset.</li>
                </ul>
                <h3 style="margin-top:18px;">Human Decisions</h3>
                <p>The selected context, final wording, live product screenshots, monotone theme, and credential placement were curated for the actual project and submission needs.</p>
            </article>
        </div>
        <div class="footer">AI Tool: ChatGPT / Codex</div>
        <div class="page-no">07 / 08</div>
    </section>

    <section class="slide">
        <div class="header">
            <div>
                <div class="label">Slide 8</div>
                <h2>Live Access, QR Code, and Reflection</h2>
            </div>
            {pill("For instructor review")}
        </div>
        <div class="grid access-grid">
            <article class="card">
                <h3>Live Product Link</h3>
                <p><a href="{site_url_html}">{site_url_html}</a></p>
                <div class="credential-grid">
                    <div class="credential"><span>Admin User</span><strong>{admin_user}</strong></div>
                    <div class="credential"><span>Admin Password</span><strong>{admin_pass}</strong></div>
                </div>
                <h3 style="margin-top:18px;">Reflection</h3>
                <p>This redesign shows that UX/UI is not only about visual polish. A useful interface helps the user understand the goal, see system state, recover from mistakes, and repeat the task with less friction. In a 3D game, hierarchy becomes especially important because the scene can easily distract from the command task.</p>
            </article>
            <a class="qr-card" href="{site_url_html}">
                <img src="{qr_image}" alt="QR code for Grid Bot 3D live site">
                <h3>Scan to Open</h3>
                <p>{site_url_html}</p>
            </a>
        </div>
        <div class="rubric">
            <div><strong>4</strong><span>Clear context and user</span></div>
            <div><strong>5</strong><span>Appropriate UX/UI concept</span></div>
            <div><strong>4</strong><span>Mockup communicates well</span></div>
            <div><strong>3</strong><span>Design rationale</span></div>
            <div><strong>2</strong><span>References and AI prompt</span></div>
            <div><strong>2</strong><span>Clear slide structure</span></div>
        </div>
        <div class="footer">{student_name} - {student_id} - {university}</div>
        <div class="page-no">08 / 08</div>
    </section>
</body>
</html>
"""


def render_pdf(html_content: str, html_path: Path, pdf_path: Path) -> None:
    html_path.write_text(html_content, encoding="utf-8")

    chrome_path = find_chrome()
    if not chrome_path:
        raise RuntimeError("Google Chrome or Chromium was not found for PDF generation.")

    command = [
        chrome_path,
        "--headless",
        "--disable-gpu",
        "--allow-file-access-from-files",
        "--no-sandbox",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path.resolve()}",
        html_path.resolve().as_uri(),
    ]

    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(
            "Chrome failed to print the PDF.\n"
            f"stdout: {result.stdout.strip()}\n"
            f"stderr: {result.stderr.strip()}"
        )


def main() -> None:
    PRESENTATION_DIR.mkdir(parents=True, exist_ok=True)
    html_path = PRESENTATION_DIR / str(CONFIG["html_output"])
    pdf_path = PRESENTATION_DIR / str(CONFIG["pdf_output"])
    html_content = build_html()
    render_pdf(html_content, html_path, pdf_path)
    print(f"HTML created: {html_path}")
    print(f"PDF created: {pdf_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
