CREATE TABLE `chapters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tutorialId` int NOT NULL,
	`label` varchar(255) NOT NULL,
	`timestampSeconds` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chapters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `token_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`reason` varchar(255) NOT NULL,
	`adminId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `token_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tutorials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` text,
	`tokenPrice` int NOT NULL DEFAULT 1,
	`demoVideoUrl` text NOT NULL,
	`demoVideoKey` text NOT NULL,
	`tutorialVideoUrl` text NOT NULL,
	`tutorialVideoKey` text NOT NULL,
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tutorials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `unlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tutorialId` int NOT NULL,
	`tokensSpent` int NOT NULL DEFAULT 1,
	`unlockedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `unlocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `isCreator` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `tokenBalance` int DEFAULT 20 NOT NULL;