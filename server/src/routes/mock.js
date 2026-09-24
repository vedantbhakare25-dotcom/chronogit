import { Router } from 'express';

const router = Router();

/**
 * Mock endpoint for demos.
 * GET /api/mock/weather -> Returns standard healthy response
 * GET /api/mock/weather?drift=breaking -> Mutates field types and removes fields
 * GET /api/mock/weather?drift=nonbreaking -> Adds extra fields
 */
router.get('/weather', (req, res) => {
  const drift = req.query.drift;

  if (drift === 'breaking') {
    // Breaking change: "temp" is now a string instead of number, "city" removed
    return res.json({
      location: 'Pune, IN',
      temperature: '31°C', // mutated from number to string & renamed
      humidity: 65,
      windSpeed: 12,
    });
  }

  if (drift === 'nonbreaking') {
    // Non-breaking: extra field added
    return res.json({
      city: 'Pune',
      temp: 31,
      humidity: 65,
      uvIndex: 7, // added field
    });
  }

// Baseline standard response (MUTATED!)
  return res.json({
    cityName: 'Pune',      // 'city' ko rename kar diya
    temp: '31°C',          // number se string kar diya (BREAKING!)
    humidity: 65,
  });
});

export default router;