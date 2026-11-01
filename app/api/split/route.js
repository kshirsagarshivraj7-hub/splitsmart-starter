import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { sentence } = await req.json();
    if (!sentence) {
      return NextResponse.json({ error: 'No sentence provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Extract the expense description and numeric amount from this text: "${sentence}". Respond with JSON only: {"description": "...", "amount": number}.`,
                    },
                  ],
                },
              ],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );
        const json = await response.json();
        const textResponse = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          const parsed = JSON.parse(textResponse);
          return NextResponse.json({
            description: parsed.description || sentence,
            amount: Number(parsed.amount || 0),
          });
        }
      } catch (err) {
        console.warn('Gemini AI fallback:', err.message);
      }
    }

    // Fallback: rule-based parser
    const amountMatch = sentence.match(/\d[\d,]*(\.\d+)?/);
    const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
    const name =
      sentence.replace(/\d[\d,]*(\.\d+)?/, '').replace(/\s+/g, ' ').trim() ||
      'Expense';

    return NextResponse.json({
      description: name.charAt(0).toUpperCase() + name.slice(1),
      amount,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

