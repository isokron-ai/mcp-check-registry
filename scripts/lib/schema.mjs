// A small JSON Schema validator for the keywords schema/server.schema.json uses:
// type (string or array), const, enum, pattern, minLength, maxLength, minimum, maximum,
// required, properties, additionalProperties: false, items, $ref to #/$defs/*.
// Any other keyword in the schema is an error, so the schema can't silently ask for more than this checks.
import { readFileSync } from 'node:fs';

const SUPPORTED = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'const', 'enum', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'required', 'properties', 'additionalProperties', 'items', 'format']);

export function loadSchema(url = new URL('../../schema/server.schema.json', import.meta.url)) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const typeOk = (v, t) => { const a = typeOf(v); return a === t || (t === 'number' && a === 'integer'); };

export function validate(value, schema, root = schema, at = '$') {
  const errors = [];
  for (const k of Object.keys(schema)) if (!SUPPORTED.has(k)) errors.push(at + ': schema keyword ' + k + ' is not supported by this validator');
  if (schema.$ref) {
    const m = /^#\/\$defs\/([\w-]+)$/.exec(schema.$ref);
    if (!m || !root.$defs || !root.$defs[m[1]]) return [at + ': bad $ref ' + schema.$ref];
    return errors.concat(validate(value, root.$defs[m[1]], root, at));
  }
  if (schema.type) {
    const ts = [].concat(schema.type);
    if (!ts.some((t) => typeOk(value, t))) return errors.concat(at + ': expected ' + ts.join(' or ') + ', got ' + typeOf(value));
  }
  if ('const' in schema && value !== schema.const) errors.push(at + ': must be ' + JSON.stringify(schema.const));
  if (schema.enum && !schema.enum.some((e) => e === value)) errors.push(at + ': must be one of ' + schema.enum.map((e) => JSON.stringify(e)).join(', '));
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(at + ': does not match ' + schema.pattern);
    if (schema.minLength != null && [...value].length < schema.minLength) errors.push(at + ': shorter than ' + schema.minLength);
    if (schema.maxLength != null && [...value].length > schema.maxLength) errors.push(at + ': longer than ' + schema.maxLength);
    if (schema.format === 'date-time' && !(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value)))) errors.push(at + ': not a UTC date-time');
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(at + ': below ' + schema.minimum);
    if (schema.maximum != null && value > schema.maximum) errors.push(at + ': above ' + schema.maximum);
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, root, at + '[' + i + ']')));
  if (typeOf(value) === 'object') {
    for (const r of schema.required || []) if (!(r in value)) errors.push(at + ': missing ' + r);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errors.push(...validate(v, props[k], root, at + '.' + k));
      else if (schema.additionalProperties === false) errors.push(at + ': unexpected property ' + k);
    }
  }
  return errors;
}
