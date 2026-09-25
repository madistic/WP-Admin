"use server"

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function getComplaintsAction() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurant_id) {
    throw new Error("Unauthorized")
  }

  const complaints = await prisma.complaint.findMany({
    where: {
      restaurant_id: session.user.restaurant_id,
    },
    orderBy: { created_at: "desc" },
  })

  return complaints
}

export async function createComplaintAction(data: {
  subject: string
  description: string
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurant_id) {
    throw new Error("Unauthorized")
  }

  const subject = data.subject?.trim()
  const description = data.description?.trim()

  if (!subject || subject.length < 3) {
    throw new Error("Subject must be at least 3 characters")
  }

  if (!description || description.length < 10) {
    throw new Error("Description must be at least 10 characters")
  }

  const complaint = await prisma.complaint.create({
    data: {
      restaurant_id: session.user.restaurant_id,
      subject,
      description,
      status: "OPEN",
    },
  })

  revalidatePath("/complaints")
  return complaint
}
