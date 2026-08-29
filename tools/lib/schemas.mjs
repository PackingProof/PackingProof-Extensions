import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import path from "node:path";
import { listJsonFiles, readJson } from "./files.mjs";

export async function createSchemaValidator(rootDirectory) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schemaDirectory = path.join(rootDirectory, "schemas");
  for (const schemaPath of await listJsonFiles(schemaDirectory)) {
    ajv.addSchema(await readJson(schemaPath));
  }

  return {
    validate(schemaName, value, label) {
      const id = `https://packingproof.dev/schemas/${schemaName}`;
      const validate = ajv.getSchema(id);
      if (!validate) throw new Error(`Schema 未注册：${schemaName}`);
      if (validate(value)) return;
      const messages = validate.errors
        .map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("；");
      throw new Error(`${label}: Schema 校验失败：${messages}`);
    },
  };
}
