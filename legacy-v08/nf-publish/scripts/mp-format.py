#!/usr/bin/env python3
"""
公众号排版转换器：Markdown → 微信兼容 inline-style HTML

用法:
  python3 scripts/mp-format.py article.md                    # 默认 magazine 主题
  python3 scripts/mp-format.py article.md --theme magazine   # 指定主题
  python3 scripts/mp-format.py article.md --preview          # 生成本地预览 HTML
  python3 scripts/mp-format.py article.md --inject           # 直接注入公众号编辑器

输出: /tmp/mp-formatted.html（纯 HTML 片段，可直接 mp.sh body 注入）

Markdown 扩展语法:
  > 引用文字             → 书摘式引用（上下细线居中斜体）
  **加粗**               → 金色下划线强调
  ---                    → ◆ 菱形分割线
  # 大标题               → 居中大号标题（仅第一个 h1 做刊头处理）
  ## 小标题              → CHAPTER 编号 + 金色短线
  - 列表项               → 竖线时间轴
  :::pullquote 金句 :::  → 居中大字金句
  :::metrics 32+|数据源|7|平台|0|人工 ::: → 数据条
"""

import json
import re
import sys
import os
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
THEMES_DIR = os.path.join(SCRIPT_DIR, "mp-themes")


def load_theme(name: str) -> dict:
    path = os.path.join(THEMES_DIR, f"{name}.json")
    if not os.path.exists(path):
        print(f"Error: theme '{name}' not found at {path}", file=sys.stderr)
        sys.exit(1)
    with open(path) as f:
        return json.load(f)


def style(props: dict) -> str:
    """Convert theme style dict to inline CSS string."""
    parts = []
    for key, val in props.items():
        css_key = key.replace("_", "-")
        parts.append(f"{css_key}:{val}")
    return ";".join(parts)


def parse_markdown(text: str, theme: dict) -> str:
    """Convert markdown to WeChat-compatible inline-styled HTML."""
    lines = text.strip().split("\n")
    html_parts = []
    colors = theme["colors"]
    styles = theme["styles"]

    chapter_count = 0
    h1_count = 0
    in_list = False
    list_items = []
    in_blockquote = False
    quote_lines = []
    in_pullquote = False
    pullquote_lines = []
    in_metrics = False
    metrics_text = ""

    def flush_list():
        nonlocal in_list, list_items
        if not list_items:
            return ""
        s = style(styles["list_container"])
        result = f'<section style="{s};">'
        for i, item in enumerate(list_items):
            # Split "title — description" or just plain item
            if "——" in item or " — " in item:
                sep = "——" if "——" in item else " — "
                title, desc = item.split(sep, 1)
                ts = style(styles["list_item_title"])
                ds = style(styles["list_item_text"])
                mb = "16px" if i < len(list_items) - 1 else "0"
                result += f'<section style="margin-bottom:{mb};">'
                result += f'<p style="{ts}">{inline_format(title.strip())}</p>'
                result += f'<p style="{ds}">{inline_format(desc.strip())}</p>'
                result += '</section>'
            else:
                ts = style(styles["list_item_title"])
                mb = "16px" if i < len(list_items) - 1 else "0"
                result += f'<section style="margin-bottom:{mb};">'
                result += f'<p style="{ts}">{inline_format(item.strip())}</p>'
                result += '</section>'
        result += '</section>'
        in_list = False
        list_items = []
        return result

    def flush_quote():
        nonlocal in_blockquote, quote_lines
        if not quote_lines:
            return ""
        bs = style(styles["blockquote"])
        ps = style(styles["blockquote_p"])
        text = "<br>".join(inline_format(l) for l in quote_lines)
        result = f'<section style="{bs};"><p style="{ps};">「{text}」</p></section>'
        in_blockquote = False
        quote_lines = []
        return result

    def render_pullquote(text: str) -> str:
        qs = style(styles["pullquote"])
        rs = style(styles["pullquote_rule"])
        lines = text.strip().split("\n")
        result = '<section style="margin:36px 0;text-align:center;">'
        result += f'<p style="font-size:10px;color:{colors["light"]};letter-spacing:6px;margin:0 0 12px;">◆ ◆ ◆</p>'
        for line in lines:
            result += f'<p style="{qs};margin:0 0 6px;">{inline_format(line.strip())}</p>'
        result += f'<section style="{rs};"></section>'
        result += '</section>'
        return result

    def render_metrics(text: str) -> str:
        """Parse: 32+|数据源|7|平台|0|人工"""
        parts = [p.strip() for p in text.strip().split("|")]
        cs = style(styles["metric_card"])
        ns = style(styles["metric_number"])
        ls = style(styles["metric_label"])
        ds = style(styles["metric_divider"])

        result = f'<section style="{cs};margin:18px 0;">'
        result += '<section style="display:flex;text-align:center;">'
        pairs = list(zip(parts[0::2], parts[1::2]))
        for i, (num, label) in enumerate(pairs):
            if i > 0:
                result += f'<section style="{ds};"></section>'
            result += f'<section style="flex:1;"><p style="{ns}">{num}</p><p style="{ls}">{label}</p></section>'
        result += '</section></section>'
        return result

    def render_divider() -> str:
        """◆ diamond divider with gradient lines."""
        lc = colors["accent"]
        dc = colors["light"]
        result = '<section style="display:flex;align-items:center;margin:28px 0;">'
        result += f'<section style="flex:1;height:1px;background:linear-gradient(90deg, rgba(196,176,138,0) 0%, {lc} 100%);"></section>'
        result += f'<span style="font-size:11px;color:{dc};padding:0 14px;letter-spacing:3px;">◆</span>'
        result += f'<section style="flex:1;height:1px;background:linear-gradient(90deg, {lc} 0%, rgba(196,176,138,0) 100%);"></section>'
        result += '</section>'
        return result

    def inline_format(text: str) -> str:
        """Process inline markdown: **bold**, *italic*, `code`, [link](url)."""
        # Bold
        ss = style(styles["strong"])
        text = re.sub(r'\*\*(.+?)\*\*', rf'<strong style="{ss};">\1</strong>', text)
        # Italic
        es = style(styles.get("em", {}))
        text = re.sub(r'\*(.+?)\*', rf'<em style="{es};">\1</em>', text)
        # Inline code
        text = re.sub(r'`(.+?)`', rf'<code style="background:{colors["card_bg"]};padding:2px 6px;border-radius:4px;font-size:13px;color:{colors["muted"]};">\1</code>', text)
        # Links → footnote style (WeChat blocks external links)
        text = re.sub(r'\[(.+?)\]\((.+?)\)', r'\1', text)
        return text

    for line in lines:
        stripped = line.strip()

        # --- Custom block: pullquote ---
        if stripped.startswith(":::pullquote"):
            in_pullquote = True
            pullquote_lines = []
            continue
        if stripped.startswith(":::metrics"):
            in_metrics = True
            metrics_text = ""
            continue
        if stripped == ":::" and in_pullquote:
            in_pullquote = False
            html_parts.append(flush_list())
            html_parts.append(flush_quote())
            html_parts.append(render_pullquote("\n".join(pullquote_lines)))
            continue
        if stripped == ":::" and in_metrics:
            in_metrics = False
            html_parts.append(flush_list())
            html_parts.append(flush_quote())
            html_parts.append(render_metrics(metrics_text))
            continue
        if in_pullquote:
            pullquote_lines.append(stripped)
            continue
        if in_metrics:
            metrics_text += stripped
            continue

        # --- Blockquote ---
        if stripped.startswith("> "):
            if not in_blockquote:
                html_parts.append(flush_list())
                in_blockquote = True
                quote_lines = []
            quote_lines.append(stripped[2:])
            continue
        elif in_blockquote:
            html_parts.append(flush_quote())

        # --- List ---
        if re.match(r'^[-*] ', stripped):
            if not in_list:
                html_parts.append(flush_quote())
                in_list = True
                list_items = []
            list_items.append(stripped[2:])
            continue
        elif in_list:
            html_parts.append(flush_list())

        # --- Horizontal rule ---
        if stripped == "---" or stripped == "***" or stripped == "___":
            html_parts.append(render_divider())
            continue

        # --- Empty line ---
        if not stripped:
            continue

        # --- H1 ---
        if stripped.startswith("# ") and not stripped.startswith("## "):
            h1_count += 1
            title_text = stripped[2:]
            if h1_count == 1:
                # First h1 → header treatment
                hs = style(styles["h1"])
                # Split by newline hint (use / or ｜ as line break)
                title_lines = re.split(r'[/／｜]', title_text)
                for tl in title_lines:
                    html_parts.append(f'<h1 style="{hs}">{inline_format(tl.strip())}</h1>')
            else:
                hs = style(styles["h1"])
                html_parts.append(f'<h1 style="{hs}">{inline_format(title_text)}</h1>')
            continue

        # --- H2 ---
        if stripped.startswith("## "):
            chapter_count += 1
            title_text = stripped[3:]
            cls = style(styles["chapter_label"])
            h2s = style(styles["h2"])
            us = style(styles["h2_underline"])
            html_parts.append('<section style="margin-bottom:18px;">')
            html_parts.append(f'<p style="{cls}">CHAPTER {chapter_count:02d}</p>')
            html_parts.append(f'<p style="{h2s}">{inline_format(title_text)}</p>')
            html_parts.append(f'<section style="{us}"></section>')
            html_parts.append('</section>')
            continue

        # --- H3 ---
        if stripped.startswith("### "):
            title_text = stripped[4:]
            h3s = style(styles["h3"])
            html_parts.append(f'<p style="{h3s}">{inline_format(title_text)}</p>')
            continue

        # --- Paragraph ---
        ps = style(styles["p"])
        html_parts.append(f'<p style="{ps}">{inline_format(stripped)}</p>')

    # Flush remaining
    html_parts.append(flush_list())
    html_parts.append(flush_quote())

    return "\n".join(p for p in html_parts if p)


def build_article(md_text: str, theme: dict, author: str = "", date: str = "") -> str:
    """Build complete article HTML with wrapper, header, and footer."""
    colors = theme["colors"]
    styles_dict = theme["styles"]

    ws = style(styles_dict["wrapper"])
    body = parse_markdown(md_text, theme)

    # Header
    hls = style(styles_dict["header_label"])
    hrs = style(styles_dict["header_rule"])
    header = f"""<section style="text-align:center;margin-bottom:32px;padding-top:8px;">
<p style="{hls}">OPC · 数字员工内参</p>
<section style="{hrs}"></section>
</section>"""

    # Byline (after first h1, inject author/date)
    byline = ""
    if author or date:
        bs = style(styles_dict["byline"])
        parts = []
        if author:
            parts.append(f"文 / {author}")
        if date:
            parts.append(date)
        byline = f'<p style="{bs}">{chr(12288).join(parts)}</p>'

    # Divider after header
    divider_top = _render_divider(colors)

    # Footer
    divider_bottom = _render_divider(colors)
    fls = style(styles_dict["footer_label"])
    fss = style(styles_dict["footer_sub"])
    footer = f"""<section style="text-align:center;margin-bottom:8px;">
<p style="{fls}">OPC · 王宇轩的数字员工团队</p>
<p style="{fss}">选题 · 剪辑 · 讲解 · 发布 — Alysa</p>
</section>"""

    # Inject byline after first </h1>
    if byline:
        # Find last h1 closing tag and inject byline after it
        idx = body.rfind("</h1>")
        if idx >= 0:
            insert_pos = idx + len("</h1>")
            body = body[:insert_pos] + "\n" + byline + "\n" + body[insert_pos:]

    return f"""<section style="{ws}">
{header}
{body}
{divider_bottom}
{footer}
</section>"""


def _render_divider(colors: dict) -> str:
    lc = colors["accent"]
    dc = colors["light"]
    return f"""<section style="display:flex;align-items:center;margin:28px 0;">
<section style="flex:1;height:1px;background:linear-gradient(90deg, rgba(196,176,138,0) 0%, {lc} 100%);"></section>
<span style="font-size:11px;color:{dc};padding:0 14px;letter-spacing:3px;">◆</span>
<section style="flex:1;height:1px;background:linear-gradient(90deg, {lc} 0%, rgba(196,176,138,0) 100%);"></section>
</section>"""


def generate_preview(html: str, theme: dict) -> str:
    """Wrap article HTML in a full preview page simulating mobile width."""
    bg = theme["colors"]["bg"]
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>公众号排版预览</title>
<style>
body {{ margin: 0; padding: 20px; background: #e8e8e8; display: flex; justify-content: center; }}
.phone {{ width: 375px; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.15); }}
.content {{ padding: 0; }}
</style>
</head>
<body>
<div class="phone">
<div class="content">
{html}
</div>
</div>
</body>
</html>"""


def main():
    import argparse
    parser = argparse.ArgumentParser(description="公众号排版转换器")
    parser.add_argument("input", help="Markdown 文件路径")
    parser.add_argument("--theme", default="magazine", help="主题名称 (default: magazine)")
    parser.add_argument("--author", default="Alysa", help="作者 (default: Alysa)")
    parser.add_argument("--date", default="", help="日期")
    parser.add_argument("--preview", action="store_true", help="生成本地预览 HTML")
    parser.add_argument("--inject", action="store_true", help="直接注入公众号编辑器")
    parser.add_argument("--output", default="/tmp/mp-formatted.html", help="输出路径")
    args = parser.parse_args()

    # Read markdown
    with open(args.input) as f:
        md_text = f.read()

    # Load theme
    theme = load_theme(args.theme)

    # Build HTML
    article_html = build_article(md_text, theme, author=args.author, date=args.date)

    if args.preview:
        preview_html = generate_preview(article_html, theme)
        preview_path = args.output.replace(".html", "-preview.html")
        with open(preview_path, "w") as f:
            f.write(preview_html)
        print(f"Preview: {preview_path}")
        subprocess.run(["open", preview_path])
    else:
        with open(args.output, "w") as f:
            f.write(article_html)
        print(f"Output: {args.output}")

    if args.inject:
        print("Injecting into WeChat MP editor...")
        subprocess.run(
            ["bash", os.path.join(SCRIPT_DIR, "mp.sh"), "body", article_html],
            cwd=os.path.join(SCRIPT_DIR, "..")
        )
        print("Done.")


if __name__ == "__main__":
    main()
