import { PermissionFlagsBits, type GuildMember, type Interaction } from "discord.js";
import { ENV } from "../config/env.js";

export function isAdmin(interaction: Interaction): boolean {
  const member = interaction.member as GuildMember | null;
  return isAdminMember(member);
}

export function isAdminMember(member: GuildMember | null | undefined): boolean {
  if (!member) return false;
  // Administrator
  if (
    typeof member.permissions !== "string" &&
    member.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }
  // cargo em ADMIN_ROLE_IDS
  const roleIds = ENV.ADMIN_ROLE_IDS;
  if (roleIds.length === 0) return false;
  const roles = member.roles;
  if (roles && "cache" in roles) {
    return roleIds.some((id) => roles.cache.has(id));
  }
  return false;
}
