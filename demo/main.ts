import { interpret } from 'xstate'
import { inspect } from '@xstate/inspect'
import { createScheduler, getTodaysDate, changeDate } from '../src'

inspect()

type Data = {
	front: string
	back: string
	iteration: number,
}

type Answer = boolean

const todaysDate = getTodaysDate().toISOString()

const machine = createScheduler<Data, Answer>({
	processAnswer(prompt, answer, {time}) {
		prompt = { ...prompt }

		if (answer === true) {
			prompt.nextReviewDate = changeDate(prompt.nextReviewDate, prompt.iteration).toISOString()
			prompt.iteration **= 2
		} else {
			prompt.nextReviewDate = getTodaysDate().toISOString()
		}

		return prompt
	}
})

const service = interpret(machine, {devTools: true})

service.start()

service.send({
	type: 'ADD_PROMPTS',
	prompts: [
		{
			id: '1',
			nextReviewDate: changeDate(todaysDate, -5).toISOString(),
			front: 'Front',
			back: 'Back',
			iteration: 2
		},
		{
			id: '2',
			nextReviewDate: todaysDate,
			front: 'Front',
			back: 'Back',
			iteration: 2,
		},
		{
			id: '3',
			nextReviewDate: changeDate(todaysDate,  2).toISOString(),
			front: 'Front',
			back: 'Back',
			iteration: 2,
		},
		{
			id: '4',
			nextReviewDate: changeDate(todaysDate,  -1).toISOString(),
			front: 'Front',
			back: 'Back',
			iteration: 2,
		}
	] 
})

service.send({
	type: 'UPDATE_PROMPTS',
	prompts: [
		{
			id: '1',
			front: 'Card 1 Front',
			back: 'Card 1 Back',
		}
	]
})

