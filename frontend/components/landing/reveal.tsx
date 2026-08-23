"use client"

import { motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
  id?: string
}

export function Reveal({ children, delay = 0, className = "", id }: RevealProps) {
  const prefersReduced = useReducedMotion()

  if (prefersReduced) {
    return (
      <div id={id} className={className}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
