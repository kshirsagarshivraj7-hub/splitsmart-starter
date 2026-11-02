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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Extract the expense description, numeric amount, and optional payer name (paid_by) from this text: "${sentence}". If no person is explicitly mentioned as paying, set paid_by to null. Respond with JSON only: {"description": "...", "amount": number, "paid_by": "..." or null}.`,
                    },
                  ],
                },
              ],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json();
          const textResponse = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textResponse) {
            const cleanJson = textResponse
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .trim();
            const parsed = JSON.parse(cleanJson);
            return NextResponse.json({
              description: parsed.description || sentence,
              amount: Number(parsed.amount || 0),
              paid_by: parsed.paid_by || null,
            });
          }
        }
      } catch (err) {
        console.warn('Gemini AI parse error, using fallback:', err.message);
      }
    }

    // Fallback: rule-based parser
    const amountMatch = sentence.match(/\d[\d,]*(\.\d+)?/);
    const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;

    let paid_by = null;
    const paidByMatch = sentence.match(/paid\s+by\s+([A-Za-z]+)/i);
    const personPaidMatch = sentence.match(/^([A-Za-z]+)\s+paid/i);
    if (paidByMatch) {
      paid_by = paidByMatch[1];
    } else if (personPaidMatch) {
      paid_by = personPaidMatch[1];
    }

    const name =
      sentence
        .replace(/paid\s+by\s+[A-Za-z]+/i, '')
        .replace(/^[A-Za-z]+\s+paid/i, '')
        .replace(/\d[\d,]*(\.\d+)?/, '')
        .replace(/\s+/g, ' ')
        .trim() || 'Expense';

    return NextResponse.json({
      description: name.charAt(0).toUpperCase() + name.slice(1),
      amount,
      paid_by,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
