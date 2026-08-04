import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../utils/firebaseAuth";
import { Link } from "../../router/RouterProvider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Recupera password</CardTitle>
          <CardDescription>
            {sent
              ? "Se l'indirizzo è registrato, riceverai un'email con le istruzioni."
              : "Inserisci l'email del tuo account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sent && (
            <form onSubmit={submit} className="space-y-3">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <Button className="w-full" type="submit" disabled={loading}>{loading ? "Invio…" : "Invia istruzioni"}</Button>
            </form>
          )}
          <Link className="block text-center text-sm text-primary" to="/login">Torna al login</Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
