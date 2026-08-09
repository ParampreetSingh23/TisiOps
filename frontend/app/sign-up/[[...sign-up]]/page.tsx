import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-5 py-16">
      <SignUp />
    </main>
  )
}
