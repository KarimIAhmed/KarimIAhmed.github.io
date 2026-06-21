const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "posts");
const BLOG_DIR = path.join(ROOT, "blog");

marked.setOptions({
  gfm: true,
  breaks: false,
});

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw.trim() };
  }

  const meta = {};

  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === "tags") {
      meta.tags = value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else if (key === "published") {
      meta.published = value.toLowerCase() !== "false";
    } else {
      meta[key] = value;
    }
  }

  return { meta, body: match[2].trim() };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveSlug(filename, meta) {
  const candidates = [meta.slug, path.basename(filename, ".md"), meta.title, meta.date];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const slug = slugify(candidate);
    if (slug) return slug;
  }

  throw new Error(
    `${filename} could not produce a URL slug. Rename the file or add slug: "your-url-slug" to frontmatter.`
  );
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageShell({ title, cssHref, navHref, navLabel, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" type="image/png" href="${cssHref === "blog.css" ? "../icon.png" : "../../icon.png"}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500&family=Lora:ital,wght@0,400;0,500;1,400&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${cssHref}">
</head>
<body>
  <main class="blog-page">
${body}
  </main>

  <nav class="blog-nav" aria-label="Site navigation">
    <a href="${navHref}">${escapeHtml(navLabel)}</a>
  </nav>
</body>
</html>
`;
}

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
    return [];
  }

  return fs
    .readdirSync(POSTS_DIR)
    .filter((filename) => filename.endsWith(".md"))
    .map((filename) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, filename), "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const slug = resolveSlug(filename, meta);

      if (!meta.title) {
        throw new Error(`${filename} is missing required frontmatter: title`);
      }
      if (!meta.date) {
        throw new Error(`${filename} is missing required frontmatter: date`);
      }

      return {
        filename,
        slug,
        meta,
        html: marked.parse(body),
      };
    })
    .filter((post) => post.meta.published !== false)
    .sort((a, b) => new Date(b.meta.date) - new Date(a.meta.date));
}

function cleanGeneratedPosts() {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
    return;
  }

  for (const entry of fs.readdirSync(BLOG_DIR)) {
    const fullPath = path.join(BLOG_DIR, entry);
    if (entry === "blog.css") continue;
    if (entry === "index.html") continue;

    if (fs.statSync(fullPath).isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

function buildIndex(posts) {
  const listItems =
    posts.length === 0
      ? '    <p class="blog-empty">No posts yet.</p>'
      : posts
          .map(
            (post) => `      <li>
        <a href="${post.slug}/" class="post-list-item">
          <h2>${escapeHtml(post.meta.title)}</h2>
          <time datetime="${escapeHtml(post.meta.date)}">${formatDate(post.meta.date)}</time>
        </a>
      </li>`
          )
          .join("\n");

  const listMarkup =
    posts.length === 0
      ? listItems
      : `    <ul class="post-list">\n${listItems}\n    </ul>`;

  const body = `    <header class="blog-header">
      <h1>Blog</h1>
      <p>Occasional notes and writing.</p>
    </header>

${listMarkup}`;

  const html = pageShell({
    title: "Blog · Karim",
    cssHref: "blog.css",
    navHref: "../",
    navLabel: "Home",
    body,
  });

  fs.writeFileSync(path.join(BLOG_DIR, "index.html"), html, "utf8");
}

function buildPost(post) {
  if (!post.slug) {
    throw new Error(`Post "${post.meta.title}" has an empty slug.`);
  }

  const postDir = path.join(BLOG_DIR, post.slug);
  if (path.resolve(postDir) === path.resolve(BLOG_DIR)) {
    throw new Error(
      `Post "${post.meta.title}" would overwrite the blog index. Add slug: "your-url-slug" to frontmatter.`
    );
  }

  fs.mkdirSync(postDir, { recursive: true });

  const body = `    <article>
      <header class="post-header">
        <h1>${escapeHtml(post.meta.title)}</h1>
        <time datetime="${escapeHtml(post.meta.date)}">${formatDate(post.meta.date)}</time>
      </header>
      <div class="post-content">
${post.html
  .split("\n")
  .map((line) => (line ? `        ${line}` : ""))
  .join("\n")}
      </div>
    </article>`;

  const html = pageShell({
    title: `${post.meta.title} · Karim`,
    cssHref: "../blog.css",
    navHref: "../",
    navLabel: "Blog",
    body,
  });

  fs.writeFileSync(path.join(postDir, "index.html"), html, "utf8");
}

function buildBlog() {
  const posts = loadPosts();
  cleanGeneratedPosts();
  buildIndex(posts);
  posts.forEach(buildPost);
  console.log(`Built blog with ${posts.length} post${posts.length === 1 ? "" : "s"}.`);
}

buildBlog();
