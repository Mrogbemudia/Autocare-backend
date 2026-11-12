// validate({ params, query, body }) parses with Zod and replaces the raw input with the parsed result.
export const validate = (schemas) => (req, res, next) => {
  try {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query)  req.query  = schemas.query.parse(req.query);
    if (schemas.body)   req.body   = schemas.body.parse(req.body ?? {});
    next();
  } catch (err) {
    next(err);
  }
};
