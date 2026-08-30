// Recipe parsing via the Claude API. The app is fully usable without a key —
// this module just reports "unavailable" and the client falls back to manual entry.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

export function llmAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class LlmUnavailableError extends Error {
  constructor() {
    super('LLM parsing unavailable — set ANTHROPIC_API_KEY in server/.env to enable photo/PDF/text auto-parsing.');
    this.name = 'LlmUnavailableError';
    this.status = 503;
  }
}

const RECIPE_TOOL = {
  name: 'emit_recipe',
  description: 'Return the recipe as structured data.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', description: 'Recipe name/title, or a short description if untitled.' },
      servings: { type: ['string', 'null'], description: 'Yield as written, e.g. "12 muffins", "1 x 8-inch cake", or null.' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Ingredient name only, no quantity. Keep distinguishing words (caster, cake, self-raising, large).' },
            quantity: { type: ['number', 'null'], description: 'Numeric amount. Convert fractions to decimals (1 1/2 -> 1.5). null if none given.' },
            unit: { type: ['string', 'null'], description: 'Unit as written: g, kg, cup, tbsp, tsp, ml, each, etc. Use "each" for whole eggs. null if none.' },
            notes: { type: ['string', 'null'], description: 'Anything else on that line: "sifted", "room temperature", "optional", brand, prep.' },
          },
          required: ['name', 'quantity', 'unit', 'notes'],
        },
      },
      method_summary: { type: ['string', 'null'], description: 'One or two sentences on the mixing method if stated (creaming, whisking, all-in-one, oil-based). null otherwise.' },
      notes: { type: ['string', 'null'], description: 'Pan size, oven temp, or other notes stated in the recipe. null otherwise.' },
    },
    required: ['name', 'servings', 'ingredients', 'method_summary', 'notes'],
  },
};

const SYSTEM = `You extract baking recipes into structured ingredient data.
Rules:
- One row per ingredient. Split combined lines ("200g butter and sugar" is not valid input, but "butter, softened 200g" is one row).
- quantity is numeric only. "1 1/2" -> 1.5, "a pinch" -> null with notes "pinch", "2-3" -> 2.5.
- Keep words that change the ingredient's density or identity: "caster sugar", "cake flour", "self-raising flour", "light brown sugar", "large eggs".
- Whole eggs: unit "each", quantity = the count.
- Do not invent ingredients, quantities, or units that are not present. Use null.
- Ignore icing/frosting/decoration sections unless the recipe is only that. If you include them, add notes "frosting".
- If the input is a photo or scan, transcribe faithfully; flag anything illegible in that row's notes.`;

function client() {
  if (!llmAvailable()) throw new LlmUnavailableError();
  return new Anthropic();
}

async function runParse(userContent) {
  const anthropic = client();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [RECIPE_TOOL],
    tool_choice: { type: 'tool', name: 'emit_recipe' },
    messages: [{ role: 'user', content: userContent }],
  });
  const block = msg.content.find((b) => b.type === 'tool_use' && b.name === 'emit_recipe');
  if (!block) throw new Error('Model did not return structured recipe data.');
  return { ...block.input, _model: MODEL };
}

export async function parseRecipeText(text) {
  return runParse([
    { type: 'text', text: `Extract this recipe:\n\n${text}` },
  ]);
}

export async function parseRecipeImage({ base64, mediaType }) {
  return runParse([
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
    { type: 'text', text: 'Extract this recipe from the image.' },
  ]);
}

export async function parseRecipePdf({ base64 }) {
  return runParse([
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
    { type: 'text', text: 'Extract this recipe from the PDF.' },
  ]);
}
