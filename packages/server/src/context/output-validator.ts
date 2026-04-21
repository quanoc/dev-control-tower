/**
 * Output Validator
 *
 * Validates agent output against OutputContract.
 */

import type { OutputContract, OutputFieldDef } from '@pipeline/shared';
import type { StepOutput, ParsedOutput } from './types.js';

export interface ValidationError {
  field: string;
  message: string;
}

export class OutputValidator {
  /**
   * Validate parsed output against output contract.
   */
  validate(
    output: StepOutput,
    contract?: OutputContract
  ): ValidationError[] {
    if (!contract) {
      // No contract defined, skip validation
      return [];
    }

    const errors: ValidationError[] = [];

    // Check required fields
    if (contract.requiredFields) {
      for (const field of contract.requiredFields) {
        const value = output.nextStepInput[field as keyof typeof output.nextStepInput];

        if (value === undefined || value === null || value === '') {
          errors.push({
            field,
            message: `Required field "${field}" is missing or empty`,
          });
        }
      }
    }

    // Check field types
    if (contract.fields) {
      for (const [fieldName, fieldDef] of Object.entries(contract.fields)) {
        const error = this.validateField(
          output.nextStepInput[fieldName as keyof typeof output.nextStepInput],
          fieldName,
          fieldDef
        );
        if (error) {
          errors.push(error);
        }
      }
    }

    // Validate artifacts
    if (!output.artifacts) {
      output.artifacts = [];
    }

    // Check if artifacts are valid
    for (let i = 0; i < output.artifacts.length; i++) {
      const artifact = output.artifacts[i];
      if (!artifact.url) {
        errors.push({
          field: `artifacts[${i}].url`,
          message: `Artifact URL is required`,
        });
      }
      if (!artifact.type) {
        errors.push({
          field: `artifacts[${i}].type`,
          message: `Artifact type is required`,
        });
      }
    }

    return errors;
  }

  /**
   * Validate a single field against its definition.
   */
  private validateField(
    value: unknown,
    fieldName: string,
    fieldDef: OutputFieldDef
  ): ValidationError | null {
    // Skip if value is not provided and field is optional
    if ((value === undefined || value === null) && fieldDef.required === false) {
      return null;
    }

    // Check type
    if (value !== undefined && value !== null) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      const expectedType = fieldDef.type;

      if (expectedType === 'array' && !Array.isArray(value)) {
        return {
          field: fieldName,
          message: `Expected array but got ${actualType}`,
        };
      }

      if (expectedType !== 'array' && actualType !== expectedType) {
        return {
          field: fieldName,
          message: `Expected ${expectedType} but got ${actualType}`,
        };
      }
    }

    return null;
  }

  /**
   * Check if output has validation errors.
   */
  hasErrors(output: StepOutput, contract?: OutputContract): boolean {
    return this.validate(output, contract).length > 0;
  }

  /**
   * Format validation errors as a string.
   */
  formatErrors(errors: ValidationError[]): string {
    return errors.map(e => `- ${e.field}: ${e.message}`).join('\n');
  }
}
