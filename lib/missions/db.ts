/**
 * lib/missions/db.ts
 * Database Integration Layer
 * Brief 10 Implementation
 *
 * Handles CRUD operations for missions, steps, and execution records
 */

import { MissionInstance, MissionStep, CoreOutput } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

const admin = createAdminClient();

// ============================================================================
// MISSION INSTANCES
// ============================================================================

export async function getMissionInstance(
  instanceId: string,
): Promise<MissionInstance | null> {
  const { data, error } = await admin
    .from("mission_instances")
    .select("*")
    .eq("id", instanceId)
    .single();

  if (error) {
    console.error("Error fetching mission instance:", error);
    return null;
  }

  return data as MissionInstance;
}

export async function createMissionInstance(
  instance: MissionInstance,
): Promise<MissionInstance | null> {
  const { data, error } = await admin
    .from("mission_instances")
    .insert([instance])
    .select()
    .single();

  if (error) {
    console.error("Error creating mission instance:", error);
    return null;
  }

  return data as MissionInstance;
}

export async function updateMissionInstance(
  instanceId: string,
  updates: Partial<MissionInstance>,
): Promise<MissionInstance | null> {
  const { data, error } = await admin
    .from("mission_instances")
    .update(updates)
    .eq("id", instanceId)
    .select()
    .single();

  if (error) {
    console.error("Error updating mission instance:", error);
    return null;
  }

  return data as MissionInstance;
}

export async function listMissionInstances(
  projectId: string,
  limit = 20,
): Promise<MissionInstance[]> {
  const { data, error } = await admin
    .from("mission_instances")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error listing mission instances:", error);
    return [];
  }

  return (data || []) as MissionInstance[];
}

// ============================================================================
// MISSION STEPS
// ============================================================================

export async function getMissionSteps(
  instanceId: string,
): Promise<MissionStep[]> {
  const { data, error } = await admin
    .from("mission_steps")
    .select("*")
    .eq("mission_instance_id", instanceId)
    .order("step_number", { ascending: true });

  if (error) {
    console.error("Error fetching mission steps:", error);
    return [];
  }

  return (data || []) as MissionStep[];
}

export async function updateMissionStep(
  instanceId: string,
  stepNumber: number,
  updates: Partial<MissionStep>,
): Promise<MissionStep | null> {
  const { data, error } = await admin
    .from("mission_steps")
    .update(updates)
    .eq("mission_instance_id", instanceId)
    .eq("step_number", stepNumber)
    .select()
    .single();

  if (error) {
    console.error("Error updating mission step:", error);
    return null;
  }

  return data as MissionStep;
}

// ============================================================================
// CORE OUTPUTS
// ============================================================================

export async function saveCoreOutput(
  output: Partial<CoreOutput>,
): Promise<CoreOutput | null> {
  const { data, error } = await admin
    .from("core_outputs")
    .insert([output])
    .select()
    .single();

  if (error) {
    console.error("Error saving core output:", error);
    return null;
  }

  return data as CoreOutput;
}

export async function getCoreOutput(
  outputId: string,
): Promise<CoreOutput | null> {
  const { data, error } = await admin
    .from("core_outputs")
    .select("*")
    .eq("id", outputId)
    .single();

  if (error) {
    console.error("Error fetching core output:", error);
    return null;
  }

  return data as CoreOutput;
}

export async function listMissionOutputs(
  instanceId: string,
): Promise<CoreOutput[]> {
  const { data, error } = await admin
    .from("core_outputs")
    .select("*")
    .eq("mission_instance_id", instanceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error listing mission outputs:", error);
    return [];
  }

  return (data || []) as CoreOutput[];
}

// ============================================================================
// MISSION EXECUTIONS (Audit Trail)
// ============================================================================

export interface MissionExecution {
  id?: string;
  mission_id: string;
  status: "success" | "failed" | "cancelled";
  started_at: Date;
  completed_at: Date;
  error_code?: string;
  error_message?: string;
  outputs_count: number;
  credits_spent: number;
}

export async function createMissionExecution(
  execution: MissionExecution,
): Promise<MissionExecution | null> {
  const { data, error } = await admin
    .from("mission_executions")
    .insert([execution])
    .select()
    .single();

  if (error) {
    console.error("Error creating mission execution record:", error);
    return null;
  }

  return data as MissionExecution;
}

export async function getMissionExecutions(
  instanceId: string,
): Promise<MissionExecution[]> {
  const { data, error } = await admin
    .from("mission_executions")
    .select("*")
    .eq("mission_id", instanceId)
    .order("completed_at", { ascending: false });

  if (error) {
    console.error("Error fetching mission executions:", error);
    return [];
  }

  return (data || []) as MissionExecution[];
}

// ============================================================================
// CREDIT RESERVATIONS
// ============================================================================

export interface CreditReservationRecord {
  id: string;
  project_id: string;
  allowance_reserved: number;
  allowance_spent: number;
  premium_reserved: number;
  premium_spent: number;
  ref_type: string;
  ref_id: string;
  idempotency_key: string | null;
  status: "active" | "released" | "completed";
  created_at: Date;
  released_at: Date | null;
}

export async function createCreditReservation(
  reservation: CreditReservationRecord,
): Promise<CreditReservationRecord | null> {
  const { data, error } = await admin
    .from("credit_reservations")
    .insert([reservation])
    .select()
    .single();

  if (error) {
    console.error("Error creating credit reservation:", error);
    return null;
  }

  return data as CreditReservationRecord;
}

export async function getCreditReservation(
  reservationId: string,
): Promise<CreditReservationRecord | null> {
  const { data, error } = await admin
    .from("credit_reservations")
    .select("*")
    .eq("id", reservationId)
    .single();

  if (error) {
    console.error("Error fetching credit reservation:", error);
    return null;
  }

  return data as CreditReservationRecord;
}

export async function updateCreditReservation(
  reservationId: string,
  updates: Partial<CreditReservationRecord>,
): Promise<CreditReservationRecord | null> {
  const { data, error } = await admin
    .from("credit_reservations")
    .update(updates)
    .eq("id", reservationId)
    .select()
    .single();

  if (error) {
    console.error("Error updating credit reservation:", error);
    return null;
  }

  return data as CreditReservationRecord;
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

export async function getProjectMissionStats(projectId: string): Promise<{
  total_missions: number;
  completed: number;
  failed: number;
  in_progress: number;
  total_outputs: number;
}> {
  const instances = await listMissionInstances(projectId, 1000);

  const stats = {
    total_missions: instances.length,
    completed: instances.filter((m) => m.status === "completed").length,
    failed: instances.filter((m) => m.status === "failed").length,
    in_progress: instances.filter((m) => m.status === "running").length,
    total_outputs: 0,
  };

  // Count total outputs
  for (const instance of instances) {
    const outputs = await listMissionOutputs(instance.id);
    stats.total_outputs += outputs.length;
  }

  return stats;
}
