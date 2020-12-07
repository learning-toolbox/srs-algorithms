import { assign, createMachine, AnyEventObject } from "xstate"
import { getTodaysDate, shufflePrompts } from "./utils"

export type PromptId = string;

export type Prompt<Data extends object> = Data & {
	id: PromptId
	nextReviewDate: string
}

export type PromptMap<Data extends object> = Record<PromptId, Prompt<Data>>

export type Context<Data extends object> = {
	currentPrompt?: Prompt<Data>
	prompts: PromptMap<Data>
	reviewQueue: PromptId[]
	promptFirstDisplayed?: number
}

type Event<Data extends object, Answer> =
	| { type: 'START' }
	| { type: 'ADD_PROMPTS', prompts: Prompt<Data>[] }
	| { type: 'UPDATE_PROMPTS', prompts: (Pick<Prompt<Data>, 'id'> & Partial<Prompt<Data>>)[] }
	| { type: 'REMOVE_PROMPTS', promptIds: PromptId[] }
	| { type: 'ANSWER', answer?: Answer }
	| { type: 'PROMPT' }
	| { type: 'RESTART' }

type TypeState<Data extends object> =
	| { 
		value: 'idle', 
		context: Context<Data> & { currentPrompt: undefined }
	}	| { 
		value: 'session' | { session: 'prompt' | 'feedback' }, 
		context: Required<Context<Data>>
	}
	| {
		value: 'completed',
		context: Context<Data> & { currentPrompt: undefined } 
	}

export type AnswerStatistics = {
	time: number
}

export type Options<Data extends object, Answer> = {
	processAnswer: (prompt: Prompt<Data>, answer: Answer | undefined, statistics: AnswerStatistics) => Prompt<Data>
	orderPromptsToReview?<Data extends object>(prompts: Prompt<Data>[]): PromptId[]
	timeToAnswer?: number
}

export function createScheduler<PromptData extends object, PromptAnswer = any>(
	{
		orderPromptsToReview = shufflePrompts,
		processAnswer,
		timeToAnswer
	}: Options<PromptData, PromptAnswer>
	) {
	const machine = createMachine<Context<PromptData>, Event<PromptData, PromptAnswer>, TypeState<PromptData>>(
		{
			id: 'scheduler',
			initial: 'idle',
			context: {
				prompts: {},
				reviewQueue: [],
			},
			states: {
				idle: {
					on: {
						START: 'session',
						ADD_PROMPTS: { actions: ['addPrompts', 'initializeReviewQueue'] },
						REMOVE_PROMPTS: { actions: ['removePrompts', 'initializeReviewQueue'] },
						UPDATE_PROMPTS: { actions: ['updatePrompts', 'initializeReviewQueue'] },
					},
				},
				session: {
					initial: 'prompt',
					states: {
						prompt: {
							always: [
								{ target: '#scheduler.completed', cond: 'isReviewComplete' }
							],
							entry: 'setNextPrompt',
							after: timeToAnswer
								? { [timeToAnswer]: { target: 'feedback', actions: ['processAnswer', 'resetPrompt'] } }
								: undefined,
							on: {
								ANSWER: {
									target: 'feedback',
									actions: ['processAnswer', 'resetPrompt'],
								},
							},
						},
						feedback: {
							on: {
								PROMPT: 'prompt'
							}
						}
					},
				},
				completed: {
					on: {
						RESTART: 'idle',
						ADD_PROMPTS: { actions: ['addPrompts', 'initializeReviewQueue'] },
						REMOVE_PROMPTS: { actions: ['removePrompts', 'initializeReviewQueue'] },
						UPDATE_PROMPTS: { actions: ['updatePrompts', 'initializeReviewQueue'] },
					},
				}
			},
		}, 
		{
			guards: {
				isReviewComplete: (context) => context.reviewQueue.length === 0 && context.currentPrompt === undefined,
			},
			actions: {
				addPrompts: assign({
					prompts: (context, event) => {
						if (event.type === 'ADD_PROMPTS') {
							return {
								...getPromptMap(event.prompts),
								...context.prompts,
							}
						}
						return context.prompts
					},
				}),
				removePrompts: assign({
					prompts: (context, event) => {
						if (event.type === 'REMOVE_PROMPTS') {
							const prompts = {...context.prompts }
							for (const promptId of event.promptIds) {
								delete prompts[promptId as string]
							}
							return prompts
						}
						return context.prompts
					},
					reviewQueue: (context, event) => {
						if (event.type === 'REMOVE_PROMPTS') {
							return context.reviewQueue.filter(id => event.promptIds.includes(id))
						}
						return context.reviewQueue
					}
				}),
				updatePrompts: assign({
					prompts: (context, event) => {
						if (event.type === 'UPDATE_PROMPTS') {
							const prompts = {...context.prompts }
							for (const prompt of event.prompts) {
								prompts[prompt.id] = {
									...prompts[prompt.id],
									...prompt,
								}
							}
							return prompts
						}
						return context.prompts
					}
				}),
				initializeReviewQueue: assign({
					reviewQueue: (context) => {
						const promptsToReview = Object.values(context.prompts)
							.filter(prompt => dateAlreadyPassed(prompt.nextReviewDate))
							.sort((p1, p2) => Date.parse(p1.nextReviewDate) - Date.parse(p2.nextReviewDate))
						return orderPromptsToReview(promptsToReview)
					}
				}),
				setNextPrompt: assign({
					currentPrompt: ({prompts, reviewQueue}) => prompts[reviewQueue[0]],
					reviewQueue: ({reviewQueue}) => reviewQueue.slice(1),
					promptFirstDisplayed: (context) => Date.now(),

				}),
				processAnswer: assign((context, event) => {
					const prompts = { ...context.prompts }
					const reviewQueue = [...context.reviewQueue]

					// Cast as AnyEventObject since the delayed transition cannot be typed
					// Since the answer can be undefined this shouldn't be a problem
					const prompt = processAnswer(
						context.currentPrompt!,
						(event as AnyEventObject).answer,
						{time: Date.now() - context.promptFirstDisplayed!}
					)
					prompts[context.currentPrompt!.id] = prompt

					if (dateAlreadyPassed(prompt.nextReviewDate)) {
						reviewQueue.push(prompt.id)
					}

					return {
						...context,
						prompts,
						reviewQueue,
					}
				}),
				resetPrompt: assign({
					currentPrompt: (context) => undefined,
					promptFirstDisplayed: (context) => undefined,
				}),
			}
		}
	)

	return machine
}

function getPromptMap<Data extends object>(prompts: Prompt<Data>[]): PromptMap<Data> {
	const promptMap: PromptMap<Data> = {};

	for (const prompt of prompts) {
		if (promptMap[prompt.id]) {
			throw new Error(`Duplicate prompts with 'id': ${prompt.id}`)
		}
		promptMap[prompt.id] = prompt
	}

	return promptMap;
}

// check if date has passed and normalize time before comparing
function dateAlreadyPassed(date: string | number): boolean {
	const d = new Date(date)
	d.setHours(0, 0, 0, 0)
	
	const today = getTodaysDate()
	
	return d <= today
}