import { UUID_RE } from "./sql";
import type { OpsFile } from "./types";
import { VITOLA_FIELD_KEYS } from "./types";

export class OpsValidationError extends Error {
  constructor(public errors: string[]) {
    super(`ops file invalid:\n  ${errors.join("\n  ")}`);
    this.name = "OpsValidationError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const strOrNull = (v: unknown, max: number) => v === null || (typeof v === "string" && v.length <= max);

export function validateVitolaFields(fields: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObj(fields)) return [`${path} must be an object`];
  for (const [k, v] of Object.entries(fields)) {
    if (!(VITOLA_FIELD_KEYS as readonly string[]).includes(k)) { errors.push(`${path}.${k} is not an editable vitola field`); continue; }
    switch (k) {
      case "name": if (!strOrNull(v, 120)) errors.push(`${path}.name must be a string of at most 120 chars or null`); break;
      case "format": if (!strOrNull(v, 80)) errors.push(`${path}.format must be a string of at most 80 chars or null`); break;
      case "ring_gauge": if (v !== null && (typeof v !== "number" || v < 20 || v > 90)) errors.push(`${path}.ring_gauge must be 20-90 or null`); break;
      case "length_inches": if (v !== null && (typeof v !== "number" || v <= 0 || v > 12)) errors.push(`${path}.length_inches must be 0-12 or null`); break;
      case "filler_countries":
        if (v !== null && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) errors.push(`${path}.filler_countries must be a string array or null`);
        break;
      default: if (!strOrNull(v, 80)) errors.push(`${path}.${k} must be a string of at most 80 chars or null`);
    }
  }
  return errors;
}

function validateOp(raw: unknown, i: number): string[] {
  const p = `ops[${i}]`;
  if (!isObj(raw)) return [`${p} must be an object`];
  const errors: string[] = [];
  if (typeof raw.reason !== "string" || raw.reason === "") errors.push(`${p}.reason is required`);
  if (typeof raw.generator !== "string" || raw.generator === "") errors.push(`${p}.generator is required`);
  if (typeof raw.reviewed !== "boolean") errors.push(`${p}.reviewed must be a boolean`);
  switch (raw.type) {
    case "fold_line":
      if (!isUuid(raw.sourceLineId)) errors.push(`${p}.sourceLineId must be a uuid`);
      if (!isUuid(raw.targetLineId)) errors.push(`${p}.targetLineId must be a uuid`);
      if (isUuid(raw.sourceLineId) && raw.sourceLineId === raw.targetLineId) errors.push(`${p}: source and target are the same line`);
      if (!isObj(raw.childFills)) errors.push(`${p}.childFills must be an object`);
      else for (const [vid, fill] of Object.entries(raw.childFills)) {
        if (!isUuid(vid)) errors.push(`${p}.childFills key ${vid} must be a uuid`);
        if (!isObj(fill)) { errors.push(`${p}.childFills[${vid}] must be an object`); continue; }
        for (const [k, v] of Object.entries(fill)) {
          if (k !== "shade" && k !== "wrapper") errors.push(`${p}.childFills[${vid}].${k} is not fillable`);
          else if (typeof v !== "string" || v === "" || v.length > 80) errors.push(`${p}.childFills[${vid}].${k} must be a short non-empty string`);
        }
      }
      break;
    case "rename_line":
      if (!isUuid(raw.lineId)) errors.push(`${p}.lineId must be a uuid`);
      if (typeof raw.brand !== "string" || raw.brand.trim() === "") errors.push(`${p}.brand must be a non-empty string`);
      if (raw.series !== null && typeof raw.series !== "string") errors.push(`${p}.series must be a string or null`);
      break;
    case "update_vitola":
      if (!isUuid(raw.vitolaId)) errors.push(`${p}.vitolaId must be a uuid`);
      errors.push(...validateVitolaFields(raw.fields, `${p}.fields`));
      if (isObj(raw.fields) && Object.keys(raw.fields).length === 0) errors.push(`${p}.fields must not be empty`);
      break;
    case "merge_vitola":
      if (!isUuid(raw.sourceVitolaId)) errors.push(`${p}.sourceVitolaId must be a uuid`);
      if (!isUuid(raw.targetVitolaId)) errors.push(`${p}.targetVitolaId must be a uuid`);
      if (isUuid(raw.sourceVitolaId) && raw.sourceVitolaId === raw.targetVitolaId) errors.push(`${p}: source and target are the same vitola`);
      break;
    case "write_name":
      if (!isUuid(raw.vitolaId)) errors.push(`${p}.vitolaId must be a uuid`);
      if (typeof raw.name !== "string" || raw.name.trim() === "" || raw.name.length > 120) errors.push(`${p}.name must be a non-empty string of at most 120 chars`);
      if (raw.confidence !== undefined && !["high", "medium", "low"].includes(raw.confidence as string)) errors.push(`${p}.confidence must be high|medium|low`);
      if (raw.sourceUrl !== undefined && typeof raw.sourceUrl !== "string") errors.push(`${p}.sourceUrl must be a string`);
      break;
    default:
      errors.push(`${p}: unknown op type ${JSON.stringify(raw.type)}`);
  }
  return errors;
}

export function validateOpsFile(input: unknown): OpsFile {
  const errors: string[] = [];
  if (!isObj(input)) throw new OpsValidationError(["ops file must be an object"]);
  if (input.version !== 1) errors.push("version must be 1");
  if (typeof input.generatedAt !== "string") errors.push("generatedAt must be a string");
  if (typeof input.generator !== "string") errors.push("generator must be a string");
  if (!Array.isArray(input.ops)) errors.push("ops must be an array");
  else input.ops.forEach((op, i) => errors.push(...validateOp(op, i)));
  if (errors.length) throw new OpsValidationError(errors);
  return input as unknown as OpsFile;
}
