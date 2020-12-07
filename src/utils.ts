import { Prompt, PromptId } from "./scheduler"

export function getTodaysDate(): Date {
	const date = new Date()
	date.setHours(0, 0, 0, 0)
	return date
}

export function changeDate(date: number | string | Date, days: number): Date {
	date = new Date(date)
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function shufflePrompts<Data extends object>(prompts: Prompt<Data>[]): PromptId[] {
	const ids = prompts.map(prompt => prompt.id)

	for (let i = ids.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
	}
	
	return ids
}