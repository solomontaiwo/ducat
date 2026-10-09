import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  RecentAuthRequiredError,
  assertRecentAuthentication,
  deleteAccountData,
} from "./lib/deleteAccount.js";

initializeApp();

export const deleteAccount = onCall(
  {
    region: "europe-west1",
    enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
    // Large histories are deleted page by page; give the work room to finish
    // and cap concurrency so a misbehaving client cannot fan out unbounded cost.
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 10,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");

    try {
      assertRecentAuthentication(request.auth.token);
    } catch (error) {
      if (error instanceof RecentAuthRequiredError) {
        throw new HttpsError("failed-precondition", error.message);
      }
      throw error;
    }

    try {
      return await deleteAccountData({ database: getFirestore(), auth: getAuth(), uid, logger });
    } catch (error) {
      logger.error("Account deletion failed", { message: error.message, code: error.code });
      throw new HttpsError("internal", "Account deletion could not be completed. Please try again.");
    }
  }
);
