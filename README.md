# TERN

一个以黑底白字、像素字体和照片为核心的静态博客。托管在 GitHub Pages。

## 为什么不是 Node

这个站是纯静态 HTML/CSS/JS：浏览器不需要 Node，GitHub Pages 也不需要 Node。

构建层用 **Hugo extended 单二进制**，因为它在没有 npm 依赖树的情况下提供了 Markdown、标签页、RSS、sitemap 和构建期图片处理（WebP、响应式尺寸、裁剪）。本地只需要一个 Hugo 可执行文件；CI 由 GitHub Actions 下载固定版本。

## 本地预览

需要 Hugo extended **0.168.0** 或兼容版本。

```bash
hugo server
```

打开 `http://localhost:1313/`。

生产构建：

```bash
hugo --minify --baseURL "https://<user>.github.io/<repo>/"
```

GitHub Pages 的项目站点需要末尾的路径；用户站点（仓库名为 `<user>.github.io`）则用 `https://<user>.github.io/`。

## 写一篇文章

每篇文章是一个 page bundle：

```text
content/posts/my-slug/
  index.md
  cover.jpg
  photo-01.jpg
```

新建：

```bash
hugo new content posts/my-slug/index.md --kind posts
```

Frontmatter 示例：

```yaml
---
title: "标题"
slug: "my-slug"
date: 2026-10-18T08:30:00+08:00
lastmod: 2026-10-18T08:30:00+08:00
description: "一句话摘要"
tags: ["photo", "life"]
kind: "photo"          # note | essay | photo
cover: "cover.jpg"
coverAlt: "封面的替代文本，必填"
photos:
  - src: "photo-01.jpg"
    alt: "照片的替代文本，必填"
    caption: "图注"
---
```

- `kind: note` / `essay`：常规文章。正文里用 figure shortcode 插入图片。
- `kind: photo`：正文是引言，`photos` 数组会在正文后渲染为照片瀑布流。
- `cover` 用于列表、OG 和文章头图（`photo` 类型不重复渲染头图）。
- `photos` 也会出现在 `/photos/` 接触印样页。
- 图片和 `index.md` 放在同一目录，Hugo 会自动处理。

正文插图：

```text
{{< figure src="photo-01.jpg" alt="必填" caption="图注" >}}
{{< figure src="cover.jpg" alt="必填" class="wide" >}}
{{< figure src="portrait.jpg" alt="必填" class="portrait" sizes="(max-width: 768px) 100vw, 480px" >}}
```

- `class="wide"`：960px 出血。
- `class="bleed"`：1200px 全出血。
- `class="portrait"`：限制为 480px。
- 不加 class：768px 正文栏。

## 图片约定

- 导出 sRGB JPEG，长边约 2000–2400px，质量 85 左右。
- 原始大图/RAW 不要进 Git；仓库只保留网页用图。
- Hugo 构建时生成 WebP 与多尺寸 `srcset`；封面额外生成 1200×630 的 OG 图。
- 所有 `coverAlt`、`photos[].alt`、figure 的 `alt` 都是必填。缺图或缺少 alt 时 Hugo 会报错/警告。

## 部署到 GitHub Pages

1. 推到 GitHub 的 `main` 分支。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送后 `.github/workflows/deploy.yml` 会构建并发布。

Workflow 用 `actions/configure-pages` 获取真实 Pages URL，再传给 Hugo 的 `--baseURL`。因此项目站点（`/<repo>/`）和用户站点（`/`）都不需要手改配置。

## 站点配置

- `hugo.toml`：站点名、描述、作者、导航文案、RSS 限制、图片质量。
- `content/_index.md`：首页描述。
- `content/about/index.md`：关于页与 colophon。
- `static/og-default.png`：没有封面时的默认 OG 图。
- `static/favicon.svg` / `static/apple-touch-icon.png`：图标。

站点名目前是 **TERN**，是初始占位品牌。改成自己的名字时，至少同步 `hugo.toml` 的 `title`、`params.author` 和 `content/_index.md` 的 `title`。

## 字号规则

像素字体是 12px 网格设计的。字号必须使用 12 的整数倍：

- 正文 24px / 40px，栏宽 32em。
- 元信息 12px / 20px。
- H3 24px，H2 36px，H1 48px（移动端 36px）。
- 首页大标题 72px（移动端 48px）。

不要使用 `clamp()`、`vw` 字号、`transform: scale()` 或非 12 倍数的字号；不要合成粗体/斜体。强调用颜色、下划线或反白。

页头的 `Aa` 会把正文切换为系统无衬线字体 18px / 1.9，用于长文和低视力阅读；默认仍是像素字体。

## 字体

[Fusion Pixel 12px Prop / Mono zh-Hans](https://github.com/TakWolf/fusion-pixel-font)，SIL OFL 1.1。许可证在 `assets/fonts/OFL.txt`。

## 目录

```text
assets/          CSS、JS、字体
content/         Markdown 与照片
layouts/         Hugo 模板、partials、shortcodes
static/          favicon、默认 OG、.nojekyll
public/          构建产物（已忽略）
resources/       Hugo 图片缓存（已忽略）
```
