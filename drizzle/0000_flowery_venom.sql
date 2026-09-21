CREATE TYPE "public"."entry_direction" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
CREATE TYPE "public"."jar_kind" AS ENUM('goal', 'habit');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "shared_jar_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"jarId" integer NOT NULL,
	"userId" integer NOT NULL,
	"amount" integer NOT NULL,
	"direction" "entry_direction" DEFAULT 'deposit' NOT NULL,
	"note" varchar(200),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_jar_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"jarId" integer NOT NULL,
	"token" varchar(32) NOT NULL,
	"createdBy" integer NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"maxUses" integer DEFAULT 0 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_jar_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shared_jar_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"jarId" integer NOT NULL,
	"userId" integer NOT NULL,
	"displayName" varchar(80) NOT NULL,
	"joinedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_jars" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"sourceLocalId" varchar(100),
	"name" varchar(120) NOT NULL,
	"icon" varchar(16) DEFAULT '🫙' NOT NULL,
	"accent" varchar(16) DEFAULT 'ocean' NOT NULL,
	"kind" "jar_kind" DEFAULT 'goal' NOT NULL,
	"target" integer NOT NULL,
	"deadline" varchar(40),
	"streak" integer,
	"lastDepositAt" varchar(40),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"supabaseUserId" uuid NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_supabaseUserId_unique" UNIQUE("supabaseUserId")
);
--> statement-breakpoint
CREATE INDEX "shared_jar_entries_jar_idx" ON "shared_jar_entries" USING btree ("jarId");--> statement-breakpoint
CREATE INDEX "shared_jar_invites_jar_idx" ON "shared_jar_invites" USING btree ("jarId");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_jar_members_jar_user_unique" ON "shared_jar_members" USING btree ("jarId","userId");--> statement-breakpoint
CREATE INDEX "shared_jar_members_user_idx" ON "shared_jar_members" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "shared_jars_owner_idx" ON "shared_jars" USING btree ("ownerId");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_jars_owner_source_unique" ON "shared_jars" USING btree ("ownerId","sourceLocalId");