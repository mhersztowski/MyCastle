import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import jsonSourceMap from "json-source-map";

export interface SourcePosition {
  line: number;
  column: number;
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
  position?: SourcePosition;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export class JsonSchemaUtils {

  private static ajvInstance: Ajv | null = null;

  private static getAjv(): Ajv {
    if (!this.ajvInstance) {
      this.ajvInstance = new Ajv({
        allErrors: true,
        strict: false,
        verbose: true,
      });
      addFormats(this.ajvInstance);
    }
    return this.ajvInstance;
  }

  /**
   * Validates a JSON object against a JSON schema
   * @param data - The JSON object to validate
   * @param schema - The JSON schema to validate against
   * @returns ValidationResult with valid flag and list of errors
   */
  public static validate(data: unknown, schema: object): ValidationResult {
    const ajv = this.getAjv();
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors: ValidationError[] = (validate.errors || []).map(
      (error: ErrorObject) => ({
        path: error.instancePath || "/",
        message: error.message || "Unknown error",
        keyword: error.keyword,
        params: error.params as Record<string, unknown>,
      })
    );

    return { valid: false, errors };
  }

  /**
   * Validates a JSON object against a JSON schema and returns error strings
   * @param data - The JSON object to validate
   * @param schema - The JSON schema to validate against
   * @returns Array of error messages (empty if valid)
   */
  public static validateToStrings(data: unknown, schema: object): string[] {
    const result = this.validate(data, schema);
    if (result.valid) {
      return [];
    }

    return result.errors.map((error) => {
      const path = error.path || "(root)";
      return `${path}: ${error.message}`;
    });
  }

  /**
   * Validates a JSON string against a JSON schema
   * @param jsonString - The JSON string to validate
   * @param schema - The JSON schema to validate against
   * @returns ValidationResult with valid flag and list of errors
   */
  public static validateString(jsonString: string, schema: object): ValidationResult {
    try {
      const data = JSON.parse(jsonString);
      return this.validate(data, schema);
    } catch (e) {
      return {
        valid: false,
        errors: [
          {
            path: "/",
            message: `Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}`,
            keyword: "parse",
            params: {},
          },
        ],
      };
    }
  }

  /**
   * Validates with additional schemas for $ref resolution
   * @param data - The JSON object to validate
   * @param schema - The main JSON schema
   * @param additionalSchemas - Map of schema URI to schema object for $ref resolution
   * @returns ValidationResult with valid flag and list of errors
   */
  public static validateWithRefs(
    data: unknown,
    schema: object,
    additionalSchemas: Map<string, object>
  ): ValidationResult {
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      verbose: true,
    });
    addFormats(ajv);

    // Add all referenced schemas
    additionalSchemas.forEach((refSchema, uri) => {
      ajv.addSchema(refSchema, uri);
    });

    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors: ValidationError[] = (validate.errors || []).map(
      (error: ErrorObject) => ({
        path: error.instancePath || "/",
        message: error.message || "Unknown error",
        keyword: error.keyword,
        params: error.params as Record<string, unknown>,
      })
    );

    return { valid: false, errors };
  }

  /**
   * Validates JSON string with source positions for errors
   * @param jsonString - The JSON string to validate
   * @param schema - The main JSON schema
   * @param additionalSchemas - Map of schema URI to schema object for $ref resolution
   * @returns ValidationResult with errors including line/column positions
   */
  public static validateStringWithRefs(
    jsonString: string,
    schema: object,
    additionalSchemas: Map<string, object>
  ): ValidationResult {
    // Parse JSON with source map
    let parsed: { data: unknown; pointers: Record<string, { key?: { line: number; column: number }; value: { line: number; column: number }; valueEnd: { line: number; column: number } }> };
    try {
      parsed = jsonSourceMap.parse(jsonString);
    } catch (e) {
      // Extract line/column from parse error if possible
      const errorMessage = e instanceof Error ? e.message : "Parse error";
      const lineMatch = errorMessage.match(/line (\d+)/i);
      const colMatch = errorMessage.match(/column (\d+)/i);

      return {
        valid: false,
        errors: [
          {
            path: "/",
            message: `Invalid JSON: ${errorMessage}`,
            keyword: "parse",
            params: {},
            position: lineMatch ? {
              line: parseInt(lineMatch[1], 10),
              column: colMatch ? parseInt(colMatch[1], 10) : 1,
            } : undefined,
          },
        ],
      };
    }

    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      verbose: true,
    });
    addFormats(ajv);

    // Add all referenced schemas
    additionalSchemas.forEach((refSchema, uri) => {
      ajv.addSchema(refSchema, uri);
    });

    const validate = ajv.compile(schema);
    const valid = validate(parsed.data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors: ValidationError[] = (validate.errors || []).map(
      (error: ErrorObject) => {
        const instancePath = error.instancePath || "";

        // Find position in source map
        // Convert instancePath (e.g., "/items/0/name") to pointer format
        const pointer = parsed.pointers[instancePath] || parsed.pointers[""];

        let position: SourcePosition | undefined;
        if (pointer) {
          // Use value position, add 1 because source-map is 0-indexed
          position = {
            line: (pointer.value?.line ?? 0) + 1,
            column: (pointer.value?.column ?? 0) + 1,
          };
        }

        return {
          path: instancePath || "/",
          message: error.message || "Unknown error",
          keyword: error.keyword,
          params: error.params as Record<string, unknown>,
          position,
        };
      }
    );

    return { valid: false, errors };
  }

    /*
    public static getRefsInFiles(schemaPath: string,  pathList : string[], refList : string[]) :void {

        if (pathList.includes(schemaPath)) {
            return;
        }
        pathList.push(schemaPath);

        const refs: string[] = [];
        let file  : FileData | undefined = App.instance().fileSystem.getRoot().getFileByPath(schemaPath);

        if (!file) {
            console.error("Schema file not found: " + schemaPath);
            return;
        }

        const schemaJson = JSON.parse(file.toString());

        traverse(schemaJson, (subSchema: any) => {
            if (subSchema.$ref) {
              refs.push(subSchema.$ref);
            }
        });

        for(const ref of refs) {
            let refPath = ref.split("#")[0];
            refList.push(refPath);
            let newSchemaPath = file.getDirPath() + "/" + refPath;
            this.getRefsInFiles(newSchemaPath, pathList, refList);
        }

        return;
    }

    public static validateFileFromFSAsync(filePath : any, schemaPath : string, onErrors : OnErrorsCallback, onSuccess : VoidCallback) {
        let file = App.instance().fileSystem.getRoot().getFileByPath(filePath);

        if (file) {
            let json = JSON.parse(file.toString());

            const ajv = new Ajv(
                {
                    allErrors: true,
                    strict: false,
                    loadSchema: loadSchema
                },
            );
    
            async function loadSchema(uri : string) {
                let schemaFile =  App.instance().fileSystem.getRoot().getFileByPath(uri);
                if (!schemaFile) {
                    onErrors(["Schema file not found " + uri]);
                    return {};
                }
                let schema = JSON.parse(schemaFile.toString())
                return schema;
            }

            let schemaFile = App.instance().fileSystem.getRoot().getFileByPath(schemaPath);
            if (!schemaFile) {
                onErrors(["Schema file not found data/schema/dir.json"]);
                return;
            }

            let schema = JSON.parse(schemaFile.toString());
    
            ajv.compileAsync(schema).then(function (validate) {
                const valid = validate(json);

                if(valid) {
                    onSuccess();
                }
                else {
                    let errors : string[] = [];
                    if (validate.errors) {
                        for (const error of validate.errors) {
                            let err : string = `instancePath: "${error.instancePath}" message: "${error.message}"`;
                            errors.push(err);
                        }
                    }
                    onErrors(errors);
                }
              })

        } else {
            onErrors(["Input file not found"])
        }
    }

    public static validateFileFromFS(inputFile : FileData, schemaPath : string, onErrors : OnErrorsCallback, onSuccess : VoidCallback) {
        const ajv = new Ajv(
            {
                allErrors: true,
                strict: false
            },
        );

        let pathList : string[] = [];
        let refList : string[] = [];
        this.getRefsInFiles(schemaPath, pathList, refList);

        for(let i : number = pathList.length - 1; i >= 0; i--) {
            let fullPath = pathList[i];
            let schemaFile : FileData | undefined = App.instance().fileSystem.getRoot().getFileByPath(fullPath);
            if (schemaFile) {
                let schema = JSON.parse(schemaFile.toString());
                ajv.addSchema(schema);
            } else {
                onErrors(["Schema file not found: " + fullPath]);
                return;
            }
        }

        let validate = ajv.getSchema(schemaPath);

        if (!validate) {
            return;
        }

        let json = JSON.parse(inputFile.toString());

        if (validate(json)) {
            onSuccess();
        } else {
            let errors : string[] = [];
            if (validate.errors) {
                for (const error of validate.errors) {
                    let err : string = `instancePath: "${error.instancePath}" message: "${error.message}"`;
                    errors.push(err);
                }
            }
            onErrors(errors);
        }

    }
    */
}