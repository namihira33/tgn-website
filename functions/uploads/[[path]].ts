// R2から画像を配信
interface Env {
  BUCKET: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;

  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;

  if (!path) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const object = await env.BUCKET.get(path);

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000'); // 1年キャッシュ

    return new Response(object.body, { headers });
  } catch (error) {
    return new Response('Error', { status: 500 });
  }
};
