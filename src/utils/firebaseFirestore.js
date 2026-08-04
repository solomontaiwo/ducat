import { getFirestore } from "firebase/firestore";
import { firebaseApp } from "./firebaseApp";
import { ensureFirebaseAppCheck } from "./firebaseAppCheck";

await ensureFirebaseAppCheck();
export const firestore = getFirestore(firebaseApp);
