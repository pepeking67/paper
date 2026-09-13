export type StudyContext={paperId:string;page:number;selectedText?:string;chunks?:Array<{page:number;section:string|null;text:string}>};
export interface AiProvider { answer(message:string,context:StudyContext):Promise<string>; }
export function getAiProvider():AiProvider|null { return null; }
