import { Router } from 'express';
import multer from 'multer';
import {
  llmAvailable, LlmUnavailableError,
  parseRecipeText, parseRecipeImage, parseRecipePdf,
} from '../anthropic.js';
import { resolveRecipe } from '../lib/recipe.js';

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();

router.get('/status', (_req, res) => {
  res.json({ available: llmAvailable() });
});

// POST /api/parse            body: { text }
// POST /api/parse  multipart: file=<image|pdf>
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    let parsed;
    let kind;
    if (req.file) {
      const mt = req.file.mimetype;
      const base64 = req.file.buffer.toString('base64');
      if (mt === 'application/pdf') {
        parsed = await parseRecipePdf({ base64 });
        kind = 'pdf';
      } else if (mt.startsWith('image/')) {
        parsed = await parseRecipeImage({ base64, mediaType: mt });
        kind = 'image';
      } else {
        return res.status(400).json({ error: `Unsupported file type: ${mt}. Upload an image or a PDF.` });
      }
    } else if (req.body && typeof req.body.text === 'string' && req.body.text.trim()) {
      parsed = await parseRecipeText(req.body.text);
      kind = 'text';
    } else {
      return res.status(400).json({ error: 'Provide a recipe as `text` or upload an image/PDF file.' });
    }

    const preview = resolveRecipe(parsed.ingredients || []);
    res.json({
      kind,
      parsed,
      preview: {
        master: preview.master,
        unresolved: preview.unresolved,
        classification: preview.classification,
        totalMasterGrams: preview.totalMasterGrams,
      },
    });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      return res.status(503).json({ error: err.message, code: 'LLM_UNAVAILABLE' });
    }
    next(err);
  }
});

// Re-run conversion + classification on a baker-edited ingredient list (no LLM).
// body: { ingredients:[{name,quantity,unit,grams?,notes?}], overrides?:{idx:{grams}} }
router.post('/resolve', (req, res) => {
  const { ingredients = [], overrides = {} } = req.body || {};
  const r = resolveRecipe(ingredients, overrides);
  res.json(r);
});

export default router;
