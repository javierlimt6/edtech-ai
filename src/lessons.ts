import type { InspectId } from "./flow";

export const LESSONS: Record<
  InspectId,
  { title: string; meaning: string; watch: string; takeaway: string }
> = {
  tokenize: {
    title: "Break the question into pieces",
    meaning:
      "AI starts with tokens: small pieces of text. Here, each word or punctuation mark becomes a token.",
    watch:
      "Workers collect the pieces and give each one a number the model can use.",
    takeaway: "A token is a piece of text, not a whole thought.",
  },
  embed: {
    title: "Turn each piece into numbers",
    meaning:
      "The model looks up a list of numbers for each token. This list is called a vector; it represents features the model can work with.",
    watch:
      "One token feeds many feature lanes. The drawers represent learned values that stay inside the machine.",
    takeaway:
      "Workers carry features. The model’s weights stay in the drawers.",
  },
  attention: {
    title: "Connect the pieces of the question",
    meaning:
      "A token needs context. Attention lets it use information from earlier tokens. Eight heads do this work in parallel.",
    watch:
      "Follow the eight worker lanes across the floors. Each head reads its connected memory bank, then the results come together.",
    takeaway:
      "Attention connects tokens so the next prediction can use the context.",
  },
  ffn: {
    title: "Work on many features at once",
    meaning:
      "Each token’s features pass through learned transformations. The representation expands, changes, and compresses again.",
    watch:
      "Eight input lanes spread into 32 work lanes across four floors, then return to eight outputs. These are representative counts.",
    takeaway:
      "One token can involve a lot of parallel work. More workers does not mean more output tokens.",
  },
  sample: {
    title: "Choose the next piece of the answer",
    meaning:
      "The model gives possible next tokens different scores. Sampling turns those scores into a choice.",
    watch:
      "Taller candidate towers mean higher probability. Filtering narrows the choices before one token is selected.",
    takeaway:
      "The model predicts the next token; it does not produce the whole answer at once.",
  },
  emit: {
    title: "Add one piece. Then repeat.",
    meaning:
      "The selected token joins the answer. The model uses the growing answer as context for its next prediction.",
    watch:
      "A worker delivers the chosen token to the answer board. The next pass starts with this new context.",
    takeaway:
      "An answer grows one token at a time. Verified draft tokens can be added together.",
  },
  cache: {
    title: "Keep useful context nearby",
    meaning:
      "The KV cache stores intermediate information from earlier tokens, so the model can reuse it on the next pass.",
    watch:
      "Workers use the storage shelves. Paging organizes this memory into blocks; it does not change the words in the answer.",
    takeaway: "Reuse avoids repeating work on earlier tokens.",
  },
  scheduler: {
    title: "Share the machine between requests",
    meaning:
      "A serving system handles several requests together. The scheduler assigns each active request a lane.",
    watch:
      "Occupied lanes have workers. With continuous batching, a waiting request can take a lane as soon as it becomes free.",
    takeaway:
      "Batch lanes belong to different requests, not different pieces of one answer.",
  },
  draft: {
    title: "Try a shortcut, then check it",
    meaning:
      "A smaller model proposes a few tokens ahead. The target model checks them before they can join the answer.",
    watch:
      "Matching proposals are kept. A mismatch and the guesses after it are discarded; the target supplies a correction.",
    takeaway: "Drafting helps only when the proposed tokens pass verification.",
  },
};
