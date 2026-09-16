-- Shared jars, their membership, their contribution log, and their invite links.
--
-- The 0000 snapshot predates this feature and only contains `users`, so this one
-- migration brings the whole shared-jar surface into existence. `IF NOT EXISTS`
-- keeps it safe to apply against a database where these tables were already
-- created out of band.

CREATE TABLE IF NOT EXISTS `shared_jars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`icon` varchar(16) NOT NULL DEFAULT '🫙',
	`accent` varchar(16) NOT NULL DEFAULT 'ocean',
	`kind` enum('goal','habit') NOT NULL DEFAULT 'goal',
	`target` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shared_jars_id` PRIMARY KEY(`id`),
	INDEX `shared_jars_owner_idx` (`ownerId`)
);

CREATE TABLE IF NOT EXISTS `shared_jar_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jarId` int NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(80) NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_jar_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_jar_members_jar_user_unique` UNIQUE(`jarId`,`userId`),
	INDEX `shared_jar_members_user_idx` (`userId`)
);

CREATE TABLE IF NOT EXISTS `shared_jar_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jarId` int NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`direction` enum('deposit','withdrawal') NOT NULL DEFAULT 'deposit',
	`note` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_jar_entries_id` PRIMARY KEY(`id`),
	INDEX `shared_jar_entries_jar_idx` (`jarId`)
);

CREATE TABLE IF NOT EXISTS `shared_jar_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jarId` int NOT NULL,
	`token` varchar(32) NOT NULL,
	`createdBy` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`maxUses` int NOT NULL DEFAULT 0,
	`uses` int NOT NULL DEFAULT 0,
	`revoked` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_jar_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_jar_invites_token_unique` UNIQUE(`token`),
	INDEX `shared_jar_invites_jar_idx` (`jarId`)
);