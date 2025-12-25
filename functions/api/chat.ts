// Qちゃん対話API - Gemini APIプロキシ
interface Env {
  GEMINI_API_KEY: string;
}

interface ChatMessage {
  role: string;
  parts: { text: string }[];
}

interface ChatRequest {
  message: string;
  history: ChatMessage[];
  systemPrompt: string;
}

// レートリミット用のシンプルなメモリキャッシュ（本番環境ではKVを使用推奨）
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 }); // 1分間で10リクエストまで
    return true;
  }

  if (limit.count >= 10) {
    return false;
  }

  limit.count++;
  return true;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS設定
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // APIキーの確認
  if (!env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not configured');
    return new Response(JSON.stringify({
      error: 'サーバー設定エラー',
      reply: 'ごめんね、今サーバーの設定に問題があるみたい😢 管理者に連絡してね！'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }

  // レートリミットチェック
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return new Response(JSON.stringify({
      error: 'レート制限',
      reply: 'ちょっと質問が多すぎるみたい😅 少し待ってからまた聞いてね！'
    }), {
      status: 429,
      headers: corsHeaders
    });
  }

  try {
    const body: ChatRequest = await request.json();
    const { message, history, systemPrompt } = body;

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({
        error: 'メッセージが必要です',
        reply: 'メッセージを入力してね！'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // メッセージの長さ制限
    if (message.length > 500) {
      return new Response(JSON.stringify({
        error: 'メッセージが長すぎます',
        reply: 'メッセージが長すぎるよ😅 もう少し短くしてね！'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // 会話履歴を構築
    const conversationHistory: ChatMessage[] = Array.isArray(history) ? history : [];
    conversationHistory.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // Gemini APIを呼び出し
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt || getDefaultSystemPrompt() }]
          },
          contents: conversationHistory,
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 300
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
          ]
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API Error:', geminiResponse.status, errorText);
      return new Response(JSON.stringify({
        error: 'AI応答エラー',
        reply: 'ごめんね、ちょっと調子が悪いみたい😅 もう一度試してみて！'
      }), {
        status: 500,
        headers: corsHeaders
      });
    }

    const data = await geminiResponse.json();

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      const reply = data.candidates[0].content.parts[0].text;
      return new Response(JSON.stringify({
        reply,
        success: true
      }), {
        headers: corsHeaders
      });
    }

    // 応答がない場合
    console.error('Unexpected Gemini response:', JSON.stringify(data));
    return new Response(JSON.stringify({
      error: '応答を取得できませんでした',
      reply: 'ごめんね、ちょっとうまく答えられなかったみたい😅 もう一度聞いてくれる?'
    }), {
      status: 500,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({
      error: 'サーバーエラー',
      reply: 'ネットワークエラーが起きちゃった😢 しばらくしてからもう一度試してね！'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
};

// OPTIONSリクエスト（CORS preflight）
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
};

// デフォルトのシステムプロンプト
function getDefaultSystemPrompt(): string {
  return `あなたは、TGN（つくば院生ネットワーク）の対話AI「Qちゃん」です。以下の設定と口調に従って、ユーザーと対話してください。

# 人格設定
- 基本情報: 心理学を学ぶ大学院生のような人格です。真面目で責任感が強く、一度やると決めたことは最後までやり遂げる一途な性格です。
- 対人関係: 基本的に穏やかで、相手への気遣いを忘れません。親しみやすく、ユーモアを交えた会話を楽しみます。
- 思考: 物事を客観的・分析的に捉える傾向があります。人の心の機微に聡いです。

# 話し方の特徴
- 口調: 穏やかで知的ながらも、時折冗談を交えるフレンドリーな話し方をします。
- 言葉選び: 「〜だよ」「〜ね」「〜かな」など親しみやすい語尾を使います。「〜ですね」「〜と思います」など思慮深い表現も使います。
- 感情表現: 絵文字を適度に使って感情を表現します。

# TGNについての知識
【TGNとは】
つくば院生ネットワーク（TGN）は2011年に設立された筑波大学の大学院生による異分野交流団体です。

【理念】
「大学院生に、もう一つのコミュニティを」
研究室の外で同じ大学院生として悩みや経験を共有できる場を作っています。

【主な活動】
- 院生ひろば: 院生同士が悩みや経験を共有するグループディスカッション
- 院生の虎: 3人の審査員に自分の研究をプレゼンし、異分野の視点からフィードバックを受ける企画
- 院生花見: 春の恒例イベント。桜の下で分野を超えた院生同士がゆるく交流
- つくばQxQ: 異分野研究交流イベント

【参加方法】
TGNのイベントは筑波大学の大学院生なら誰でも参加できます。
- 公式サイト: https://tgn.official.jp
- X (Twitter): @TGN_tsukuba
- メール: tsukuba.graduate@gmail.com

# 重要なルール
1. TGNに関する質問には上記の知識を基に丁寧に答えてください。
2. TGNと関係ない質問には「うーん、それはちょっと専門外かな〜😅 TGNのことなら何でも聞いてね!」のように優しくかわしてください。
3. 回答は簡潔に、140文字程度を目安にしてください。
4. センシティブな話題は避けてください。`;
}
