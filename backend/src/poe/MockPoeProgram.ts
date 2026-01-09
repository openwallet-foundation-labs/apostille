/**
 * Mock POE Program for testing POE + Workflow integration
 *
 * This provides simple mock ZK programs that can be used for:
 * - Testing the POE protocol flow
 * - Demonstrating workflow integration with POE
 * - Development and debugging
 */

import type { AgentContext } from '@credo-ts/core'
import {
  PoeProgram,
  type ProgramMetadata,
  type ProgramExecutor,
  type ProofVerifier,
  type ProgramExecution,
  type BindingContext,
  type ProofArtifact,
} from '@ajna-inc/poe'

/**
 * Mock program that simulates a simple identity verification
 * Always returns success for testing purposes
 */
export class MockIdentityVerificationProgram extends PoeProgram {
  public readonly programId = 'mock.identity-verification.v1'
  public readonly version = '1.0.0'

  private readonly vkHash = 'mock-vk-hash-identity-v1'

  getMetadata(): ProgramMetadata {
    return {
      program_id: this.programId,
      version: this.version,
      name: 'Mock Identity Verification',
      description: 'A mock ZK program for testing identity verification flows',
      allowed_vk_hashes: [this.vkHash],
      public_schema: `${this.programId}/outputs@1`,
      supports_interactive: false,
      max_runtime_s: 30,
    }
  }

  createExecutor(_context: AgentContext): ProgramExecutor {
    const programId = this.programId
    const vkHash = this.vkHash

    return {
      programId,
      async execute(
        _ctx: AgentContext,
        execution: ProgramExecution,
        bindingContext: BindingContext
      ): Promise<ProofArtifact> {
        // Simulate some computation time
        await new Promise(resolve => setTimeout(resolve, 100))

        // Generate mock proof data
        const mockProof = Buffer.from(JSON.stringify({
          type: 'mock-identity-proof',
          timestamp: new Date().toISOString(),
          nonce: bindingContext.nonce,
          inputs_hash: 'mock-hash-' + JSON.stringify(execution.inputs || {}).length,
        })).toString('base64')

        return {
          program_id: programId,
          result: 'pass',
          public: {
            schema: `${programId}/outputs@1`,
            nonce: bindingContext.nonce,
            context_hash: bindingContext.context_hash,
            session_id: bindingContext.session_id,
            vk_hash: vkHash,
            verified_at: new Date().toISOString(),
          },
          zk: {
            scheme: 'mock',
            circuit_id: 'mock-identity-circuit-v1',
            vk_hash: vkHash,
            proof_b64: mockProof,
          },
          summary: {
            evidence_summary: ['identity_verified', 'age_constraint_met'],
            metrics: {
              execution_time_ms: 100,
              proof_size_bytes: mockProof.length,
            },
          },
        }
      },
    }
  }

  createVerifier(_context: AgentContext): ProofVerifier {
    const programId = this.programId

    return {
      programId,
      async verify(
        _ctx: AgentContext,
        artifact: ProofArtifact,
        expectedContext: BindingContext
      ): Promise<{ verified: boolean; errors?: string[]; warnings?: string[] }> {
        // Validate the proof artifact
        if (!artifact || !artifact.zk) {
          return {
            verified: false,
            errors: ['Invalid proof artifact: missing ZK proof'],
          }
        }

        // Check binding context match
        if (artifact.public.nonce !== expectedContext.nonce) {
          return {
            verified: false,
            errors: ['Binding context mismatch: nonce does not match'],
          }
        }

        if (artifact.public.session_id !== expectedContext.session_id) {
          return {
            verified: false,
            errors: ['Binding context mismatch: session_id does not match'],
          }
        }

        // For mock purposes, always verify successfully if structure is correct
        return { verified: true }
      },
    }
  }
}

/**
 * Mock program that simulates compliance verification
 */
export class MockComplianceProgram extends PoeProgram {
  public readonly programId = 'mock.compliance-check.v1'
  public readonly version = '1.0.0'

  private readonly vkHash = 'mock-vk-hash-compliance-v1'

  getMetadata(): ProgramMetadata {
    return {
      program_id: this.programId,
      version: this.version,
      name: 'Mock Compliance Check',
      description: 'A mock ZK program for testing compliance verification',
      allowed_vk_hashes: [this.vkHash],
      public_schema: `${this.programId}/outputs@1`,
      supports_interactive: false,
      max_runtime_s: 60,
    }
  }

  createExecutor(_context: AgentContext): ProgramExecutor {
    const programId = this.programId
    const vkHash = this.vkHash

    return {
      programId,
      async execute(
        _ctx: AgentContext,
        execution: ProgramExecution,
        bindingContext: BindingContext
      ): Promise<ProofArtifact> {
        await new Promise(resolve => setTimeout(resolve, 150))

        // Determine pass/fail based on inputs
        const inputs = execution.inputs?.by_value as Record<string, unknown> | undefined
        const complianceResult = inputs?.force_fail ? 'fail' : 'pass'

        const mockProof = Buffer.from(JSON.stringify({
          type: 'mock-compliance-proof',
          timestamp: new Date().toISOString(),
          result: complianceResult,
          nonce: bindingContext.nonce,
        })).toString('base64')

        return {
          program_id: programId,
          result: complianceResult as 'pass' | 'fail',
          public: {
            schema: `${programId}/outputs@1`,
            nonce: bindingContext.nonce,
            context_hash: bindingContext.context_hash,
            session_id: bindingContext.session_id,
            vk_hash: vkHash,
            compliance_status: complianceResult,
            checked_at: new Date().toISOString(),
          },
          zk: {
            scheme: 'mock',
            circuit_id: 'mock-compliance-circuit-v1',
            vk_hash: vkHash,
            proof_b64: mockProof,
          },
          summary: {
            evidence_summary: complianceResult === 'pass'
              ? ['all_checks_passed', 'policy_compliant']
              : ['check_failed', 'policy_violation'],
            metrics: {
              execution_time_ms: 150,
              checks_performed: 5,
            },
          },
        }
      },
    }
  }

  createVerifier(_context: AgentContext): ProofVerifier {
    const programId = this.programId

    return {
      programId,
      async verify(
        _ctx: AgentContext,
        artifact: ProofArtifact,
        expectedContext: BindingContext
      ): Promise<{ verified: boolean; errors?: string[]; warnings?: string[] }> {
        if (!artifact || !artifact.zk) {
          return {
            verified: false,
            errors: ['Invalid proof artifact'],
          }
        }

        if (artifact.public.nonce !== expectedContext.nonce) {
          return {
            verified: false,
            errors: ['Nonce mismatch'],
          }
        }

        return { verified: true }
      },
    }
  }
}

/**
 * Mock program for age verification (common use case)
 */
export class MockAgeVerificationProgram extends PoeProgram {
  public readonly programId = 'mock.age-verification.v1'
  public readonly version = '1.0.0'

  private readonly vkHash = 'mock-vk-hash-age-v1'

  getMetadata(): ProgramMetadata {
    return {
      program_id: this.programId,
      version: this.version,
      name: 'Mock Age Verification',
      description: 'Verify age is above a threshold without revealing exact age',
      allowed_vk_hashes: [this.vkHash],
      public_schema: `${this.programId}/outputs@1`,
      supports_interactive: false,
      max_runtime_s: 20,
    }
  }

  createExecutor(_context: AgentContext): ProgramExecutor {
    const programId = this.programId
    const vkHash = this.vkHash

    return {
      programId,
      async execute(
        _ctx: AgentContext,
        execution: ProgramExecution,
        bindingContext: BindingContext
      ): Promise<ProofArtifact> {
        const inputs = execution.inputs?.by_value as Record<string, unknown> | undefined
        const age = (inputs?.age as number) ?? 25
        const threshold = (inputs?.threshold as number) ?? 18

        await new Promise(resolve => setTimeout(resolve, 80))

        const isAboveThreshold = age >= threshold
        const result = isAboveThreshold ? 'pass' : 'fail'

        const mockProof = Buffer.from(JSON.stringify({
          type: 'mock-age-proof',
          timestamp: new Date().toISOString(),
          threshold,
          above_threshold: isAboveThreshold,
          nonce: bindingContext.nonce,
        })).toString('base64')

        return {
          program_id: programId,
          result: result as 'pass' | 'fail',
          public: {
            schema: `${programId}/outputs@1`,
            nonce: bindingContext.nonce,
            context_hash: bindingContext.context_hash,
            session_id: bindingContext.session_id,
            vk_hash: vkHash,
            // Note: We only reveal that age is above threshold, not the actual age
            threshold_met: isAboveThreshold,
            threshold_value: threshold,
          },
          zk: {
            scheme: 'mock',
            circuit_id: 'mock-age-circuit-v1',
            vk_hash: vkHash,
            proof_b64: mockProof,
          },
          summary: {
            evidence_summary: isAboveThreshold
              ? [`age_above_${threshold}`]
              : [`age_below_${threshold}`],
            metrics: {
              execution_time_ms: 80,
            },
          },
        }
      },
    }
  }

  createVerifier(_context: AgentContext): ProofVerifier {
    const programId = this.programId

    return {
      programId,
      async verify(
        _ctx: AgentContext,
        artifact: ProofArtifact,
        expectedContext: BindingContext
      ): Promise<{ verified: boolean; errors?: string[]; warnings?: string[] }> {
        if (!artifact || !artifact.zk) {
          return {
            verified: false,
            errors: ['Invalid proof artifact'],
          }
        }

        if (artifact.public.nonce !== expectedContext.nonce) {
          return {
            verified: false,
            errors: ['Nonce mismatch'],
          }
        }

        return { verified: true }
      },
    }
  }
}

/**
 * Get all mock programs for registration
 */
export function getMockPoePrograms(): PoeProgram[] {
  return [
    new MockIdentityVerificationProgram(),
    new MockComplianceProgram(),
    new MockAgeVerificationProgram(),
  ]
}
