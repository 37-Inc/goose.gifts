import { db } from '@/lib/db';
import { adminActions, errorLogs } from '@/lib/db/schema';
import type { AdminActionType, ErrorType } from './types';
import { getAdminId } from './auth';
import { eq, desc } from 'drizzle-orm';

/**
 * Log an admin action for audit trail
 */
export async function logAdminAction(
  actionType: AdminActionType,
  targetSlug?: string,
  reason?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const adminId = await getAdminId();

    if (!adminId) {
      console.warn('Attempted to log admin action without authenticated session');
      return;
    }

    await db.insert(adminActions).values({
      adminId,
      actionType,
      targetSlug: targetSlug || null,
      reason: reason || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't throw - audit logging failure shouldn't break the main operation
  }
}

/**
 * Log an error for monitoring
 */
export async function logError(
  errorType: ErrorType,
  errorMessage: string,
  stackTrace?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(errorLogs).values({
      errorType,
      errorMessage,
      stackTrace: stackTrace || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      resolved: 0,
    });
  } catch (error) {
    console.error('Failed to log error:', error);
    // Don't throw - error logging failure shouldn't break the main operation
  }
}

/**
 * Get recent error logs
 */
export async function getRecentErrors(limit: number = 50, errorType?: ErrorType) {
  try {
    let query = db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(limit);

    if (errorType) {
      query = query.where(eq(errorLogs.errorType, errorType)) as typeof query;
    }

    return await query;
  } catch (error) {
    console.error('Failed to fetch error logs:', error);
    return [];
  }
}

/**
 * Clear all error logs
 */
export async function clearErrorLogs(): Promise<void> {
  try {
    await db.delete(errorLogs);
  } catch (error) {
    console.error('Failed to clear error logs:', error);
    throw error;
  }
}
