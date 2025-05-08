import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import User from "@/models/User"
import { getToken } from "next-auth/jwt"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"

export async function PATCH(
  request: NextRequest,
) {
  try {
    const token = await getToken({ req: request })
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectToDatabase()
    
    const data = await request.json()
    const user = await User.findOne({ email: token.email })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Handle password update
    if (data.currentPassword && data.newPassword) {
      const isValidPassword = await bcrypt.compare(
        data.currentPassword,
        user.password
      )

      if (!isValidPassword) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        )
      }

      const hashedPassword = await bcrypt.hash(data.newPassword, 10)
      user.password = hashedPassword
    }

    // Update profile fields
    if (data.fullName) user.fullName = data.fullName
    if (data.username) user.username = data.username
    if (data.bio) user.bio = data.bio
    if (data.avatar) user.avatar = data.avatar
    if (data.website) user.website = data.website

    // Update settings
    if (data.notificationSettings) {
      user.notificationSettings = {
        ...user.notificationSettings,
        ...data.notificationSettings,
      }
    }

    if (data.privacySettings) {
      user.privacySettings = {
        ...user.privacySettings,
        ...data.privacySettings,
      }
    }

    if (data.twoFactorEnabled !== undefined) {
      user.twoFactorEnabled = data.twoFactorEnabled
    }

    await user.save()

    return NextResponse.json({
      id: user._id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatar: user.avatar,
      bio: user.bio,
      website: user.website,
      notificationSettings: user.notificationSettings,
      privacySettings: user.privacySettings,
      twoFactorEnabled: user.twoFactorEnabled,
    })
  } catch (error) {
    console.error("Error updating profile:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
} 