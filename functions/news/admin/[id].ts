// 管理画面投稿の個別記事ページ
interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const id = params.id;

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const post = await env.DB.prepare(
      'SELECT * FROM posts WHERE id = ?'
    ).bind(id).first();

    if (!post) {
      return new Response('Not Found', { status: 404 });
    }

    // HTMLページを生成
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title as string)} | つくば院生ネットワーク</title>
  <link rel="stylesheet" href="/styles.css">
  <style>
    body {
      font-family: 'Noto Sans JP', sans-serif;
      line-height: 1.8;
      color: #1a1a1a;
      background-color: #f9fafb;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: #2563eb;
      text-decoration: none;
      margin-bottom: 2rem;
    }
    .back-link:hover {
      text-decoration: underline;
    }
    .article {
      background: white;
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .article-header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .category {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 9999px;
      background-color: #2563eb;
      color: white;
      margin-bottom: 0.5rem;
    }
    .category.event {
      background-color: #f59e0b;
    }
    .title {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0.5rem 0;
    }
    .date {
      color: #6b7280;
      font-size: 0.875rem;
    }
    .featured-image {
      width: 100%;
      border-radius: 0.5rem;
      margin-bottom: 2rem;
    }
    .content {
      font-size: 1rem;
      white-space: pre-wrap;
    }
    .content p {
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/news" class="back-link">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      NEWSに戻る
    </a>

    <article class="article">
      <header class="article-header">
        <span class="category ${post.category === 'event' ? 'event' : ''}">${getCategoryLabel(post.category as string)}</span>
        <h1 class="title">${escapeHtml(post.title as string)}</h1>
        <time class="date">${formatDate(post.created_at as string)}</time>
      </header>

      ${post.image_url ? `<img src="${escapeHtml(post.image_url as string)}" alt="" class="featured-image">` : ''}

      <div class="content">
        ${formatContent(post.content as string)}
      </div>
    </article>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'event': return 'イベント';
    case 'info': return 'お知らせ';
    default: return 'お知らせ';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function formatContent(content: string): string {
  // 改行を<br>に変換し、段落を<p>でラップ
  const paragraphs = content.split(/\n\n+/);
  return paragraphs
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
