// Stripe Checkout Session作成用API
// Cloudflare Pages Functions

interface Env {
  STRIPE_SECRET_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS対応
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json() as { amount: number };
    const { amount } = body;

    // 金額バリデーション
    if (![100, 500, 1000].includes(amount)) {
      return new Response(
        JSON.stringify({ error: '無効な金額です' }),
        { status: 400, headers }
      );
    }

    // Stripe APIを直接呼び出し（Cloudflare Workers環境対応）
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'success_url': 'https://tgn.official.jp/donate/success',
        'cancel_url': 'https://tgn.official.jp/donate',
        'line_items[0][price_data][currency]': 'jpy',
        'line_items[0][price_data][product_data][name]': `TGN応援寄付 ${amount}円`,
        'line_items[0][price_data][product_data][description]': 'つくば院生ネットワーク（TGN）への寄付',
        'line_items[0][price_data][unit_amount]': amount.toString(),
        'line_items[0][quantity]': '1',
        'submit_type': 'donate',
      }).toString(),
    });

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error('Stripe error:', session);
      return new Response(
        JSON.stringify({ error: '決済セッションの作成に失敗しました' }),
        { status: 500, headers }
      );
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました' }),
      { status: 500, headers }
    );
  }
};

// OPTIONSリクエスト（CORS preflight）
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
