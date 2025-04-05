import { z } from 'zod';

export const todoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  deadline: z.string(),
  finished: z.boolean(),
});

export const todosSchema = z.array(todoSchema);

export type Todo = z.infer<typeof todoSchema>;
export type Todos = z.infer<typeof todosSchema>;

export const parseTodo = (data: unknown) => todoSchema.parse(data);
export const parseTodos = (data: unknown) => todosSchema.parse(data);
