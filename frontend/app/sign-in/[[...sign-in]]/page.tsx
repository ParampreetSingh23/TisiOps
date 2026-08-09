import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-5 py-16">
      <SignIn />
    </main>
  )
}
