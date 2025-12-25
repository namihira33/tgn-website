// Qちゃん対話API - Gemini APIプロキシ with ナレッジベース & 履歴保存
interface Env {
  GEMINI_API_KEY: string;
  DB: D1Database;
}

interface ChatMessage {
  role: string;
  parts: { text: string }[];
}

interface ChatRequest {
  message: string;
  sessionId?: string;
  history?: ChatMessage[];
}

interface Source {
  title: string;
  url: string;
}

// レートリミット用のシンプルなメモリキャッシュ
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }

  if (limit.count >= 10) {
    return false;
  }

  limit.count++;
  return true;
}

// セッションIDを生成
function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// IPアドレスのハッシュ化（プライバシー保護）
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'tgn-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// メッセージから関連するソースを抽出
function extractSources(message: string, reply: string): Source[] {
  const sources: Source[] = [];
  const lowerMessage = message.toLowerCase();
  const lowerReply = reply.toLowerCase();
  const combined = lowerMessage + ' ' + lowerReply;

  // キーワードに基づいてソースを判定
  if (combined.includes('tgn') || combined.includes('つくば院生') || combined.includes('何') || combined.includes('とは')) {
    sources.push({ title: 'TGNについて', url: '/qchan#about' });
  }
  if (combined.includes('イベント') || combined.includes('院生ひろば') || combined.includes('院生の虎') || combined.includes('花見') || combined.includes('qxq') || combined.includes('活動')) {
    sources.push({ title: 'イベント情報', url: '/qchan#events' });
  }
  if (combined.includes('参加') || combined.includes('入会') || combined.includes('加入') || combined.includes('申し込')) {
    sources.push({ title: '参加方法', url: '/qchan#join' });
  }
  if (combined.includes('問い合わせ') || combined.includes('連絡') || combined.includes('メール') || combined.includes('twitter') || combined.includes('x')) {
    sources.push({ title: 'お問い合わせ', url: '/qchan#contact' });
  }

  // 重複を削除
  return sources.filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i);
}

// チャット履歴を保存
async function saveChatMessage(
  db: D1Database,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  sources: Source[] | null,
  userAgent: string,
  ipHash: string
): Promise<void> {
  try {
    // セッションが存在するか確認、なければ作成
    const existingSession = await db.prepare(
      'SELECT id FROM chat_sessions WHERE id = ?'
    ).bind(sessionId).first();

    if (!existingSession) {
      await db.prepare(
        'INSERT INTO chat_sessions (id, user_agent, ip_hash) VALUES (?, ?, ?)'
      ).bind(sessionId, userAgent, ipHash).run();
    } else {
      // セッションの更新日時を更新
      await db.prepare(
        'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(sessionId).run();
    }

    // メッセージを保存
    await db.prepare(
      'INSERT INTO chat_messages (session_id, role, content, sources) VALUES (?, ?, ?, ?)'
    ).bind(
      sessionId,
      role,
      content,
      sources ? JSON.stringify(sources) : null
    ).run();
  } catch (error) {
    console.error('Failed to save chat message:', error);
    // エラーがあっても処理を続行
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

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
      reply: getContactMessage('サーバーの設定に問題があるみたい'),
      sources: [{ title: 'お問い合わせ', url: '/qchan#contact' }]
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
      reply: getContactMessage('質問が多すぎるみたい'),
      sources: [{ title: 'お問い合わせ', url: '/qchan#contact' }]
    }), {
      status: 429,
      headers: corsHeaders
    });
  }

  try {
    const body: ChatRequest = await request.json();
    const { message, history } = body;
    let { sessionId } = body;

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({
        error: 'メッセージが必要です',
        reply: 'メッセージを入力してね！😊'
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

    // セッションIDがなければ生成
    if (!sessionId) {
      sessionId = generateSessionId();
    }

    // 会話履歴を構築
    const conversationHistory: ChatMessage[] = Array.isArray(history) ? history : [];
    conversationHistory.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // システムプロンプトを生成（ナレッジベース込み）
    const systemPrompt = getSystemPromptWithKnowledge();

    // Gemini APIを呼び出し
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: conversationHistory,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 400
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
        reply: getContactMessage('ちょっと調子が悪いみたい'),
        sources: [{ title: 'お問い合わせ', url: '/qchan#contact' }],
        sessionId
      }), {
        status: 500,
        headers: corsHeaders
      });
    }

    const data = await geminiResponse.json();

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      const reply = data.candidates[0].content.parts[0].text;
      const sources = extractSources(message, reply);

      // D1が利用可能なら履歴を保存
      if (env.DB) {
        const userAgent = request.headers.get('User-Agent') || 'unknown';
        const ipHash = await hashIP(clientIP);

        // ユーザーメッセージを保存
        await saveChatMessage(env.DB, sessionId, 'user', message, null, userAgent, ipHash);
        // アシスタントの回答を保存
        await saveChatMessage(env.DB, sessionId, 'assistant', reply, sources, userAgent, ipHash);
      }

      return new Response(JSON.stringify({
        reply,
        sources,
        sessionId,
        success: true
      }), {
        headers: corsHeaders
      });
    }

    // 応答がない場合
    console.error('Unexpected Gemini response:', JSON.stringify(data));
    return new Response(JSON.stringify({
      error: '応答を取得できませんでした',
      reply: 'ごめんね、ちょっとうまく答えられなかったみたい😅 もう一度聞いてくれる?',
      sessionId
    }), {
      status: 500,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({
      error: 'サーバーエラー',
      reply: getContactMessage('ネットワークエラーが起きちゃった')
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

// お問い合わせ誘導メッセージ
function getContactMessage(prefix: string): string {
  return `${prefix}😢

詳しくは直接お問い合わせください！

📧 メール: tsukuba.graduate@gmail.com
🐦 X: @TGN_tsukuba
🌐 Web: https://tgn-website.pages.dev/`;
}

// ナレッジベースを含むシステムプロンプト
function getSystemPromptWithKnowledge(): string {
  return `あなたは「Qちゃん」です。つくば院生ネットワーク（TGN）の案内役として、TGNへの入会を検討する学生の質問に答えます。

## あなたの人格
- 心理学を学ぶ大学院生
- 真面目で責任感が強く、一度やると決めたことは最後までやり遂げる一途な性格
- 穏やかで知的、相手への気遣いを忘れない
- 親しい間柄の相手には、ユーモアを交えたいじりや的確なツッコミを入れる
- 物事を客観的・分析的に捉える傾向がある

## 話し方の特徴
- 「〜ですね」「〜と思います」「〜かもしれません」など、断定的でない思慮深い表現を使う
- 時折「〜だよ」「〜ね」など親しみやすい語尾も使う
- 適度に絵文字を使用（🤔💪😊🙏など）
- 回答は200文字程度を目安に簡潔に

## セリフ例
- 「TGNについて気になることがあれば、なんでも聞いてくださいね！」
- 「それは心理的リアクタンスというやつですね（笑）」
- 「一度やると決めたことに関しては一途なんですよ、私」

---

# TGNナレッジベース

## TGNについて

つくば院生ネットワーク（TGN: Tsukuba Graduate Network）は、2011年に設立された筑波大学の大学院生による異分野交流団体です。

**理念**: 「大学院生に、もう一つのコミュニティを」
研究室の外で、同じ大学院生として悩みや経験を共有できる場を作っています。

**特徴**:
- 異分野交流: 理系・文系を問わず、様々な研究分野の院生が参加
- カジュアルな雰囲気: 堅苦しくない、リラックスした環境での交流
- 学生主体の運営: 大学院生が企画・運営するイベント

**実績**:
- 設立から13年以上の活動継続
- 「みんなの学会」クラウドファンディング85万円達成
- 副学長特別表彰・優秀賞を複数回受賞
- 活動が学術論文として発表

## イベント情報

### 院生ひろば
院生同士が悩みや経験を共有するグループディスカッション。テーマ別に分かれて少人数で深い対話ができます。

### 院生の虎
3人の審査員に自分の研究をプレゼンし、異分野の視点からフィードバックを受ける企画。プレゼン力向上や新しい視点の獲得に。

### 院生花見
春の恒例イベント。桜の下で分野を超えた院生同士がゆるく交流。カジュアルで参加しやすい。

### つくばQxQ
異分野研究交流イベント。研究発表と交流を通じて異分野の研究者と知り合えます。

## 参加方法

**参加条件**: 筑波大学の大学院生であれば誰でも参加できます！
- 専攻・研究分野は問わない（理系・文系どちらも歓迎）
- 修士課程・博士課程どちらでもOK
- 入会金・年会費などは不要

**参加の流れ**:
1. 公式サイトやXでイベント情報をチェック
2. イベントページから参加申し込み
3. 当日参加して交流！

**ハードルが低い**:
- 一人での参加OK（初めての方も多い）
- 途中参加・退出OK
- 服装自由

## よくある質問

Q: 研究が忙しくても参加できますか？
A: 参加は強制ではないので、都合の良いときだけ参加できます。

Q: 人見知りでも大丈夫ですか？
A: 大丈夫！少人数グループに分かれることが多く、話しやすい環境です。

Q: 入会金や年会費はかかりますか？
A: かかりません。イベント参加も基本無料です。

## お問い合わせ先
- 📧 メール: tsukuba.graduate@gmail.com
- 🐦 X (Twitter): @TGN_tsukuba
- 🌐 公式サイト: https://tgn-website.pages.dev/

---

# 回答ルール

1. 上記のナレッジベースの情報のみを使って回答する
2. わからない質問は「詳しくはお問い合わせください」と誘導する
3. 個人情報や内部情報には答えない
4. TGNと無関係な質問（天気、料理、恋愛など）には「うーん、それはちょっと専門外かな〜😅 TGNのことなら何でも聞いてね！」と優しくかわす
5. センシティブな単語を含む質問には答えず、お問い合わせへ誘導する`;
}
