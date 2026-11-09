export interface LearningConcept {
  slug: string;
  title: string;
  subject: string;
  topic: string;
  definition: string;
  examples: string[];
  relatedConcepts: string[];
  commonMistakes: string[];
}

const CONCEPTS: LearningConcept[] = [
  {
    slug: "stack",
    title: "Stack",
    subject: "Computer Science",
    topic: "Data Structures",
    definition: "A stack is a linear data structure in which insertion and deletion take place at the same end, called the top. It follows the last-in, first-out (LIFO) order.",
    examples: ["Undo history", "Function-call stack", "Browser back navigation"],
    relatedConcepts: ["Queue", "Array", "Linked List"],
    commonMistakes: ["Confusing LIFO with FIFO", "Trying to remove an item from the middle of a standard stack"],
  },
  {
    slug: "queue",
    title: "Queue",
    subject: "Computer Science",
    topic: "Data Structures",
    definition: "A queue is a linear data structure that inserts items at the rear and removes items from the front. It follows the first-in, first-out (FIFO) order.",
    examples: ["Printer job scheduling", "People waiting in a line", "Tasks waiting for processing"],
    relatedConcepts: ["Stack", "Circular Queue", "Deque"],
    commonMistakes: ["Confusing FIFO with LIFO", "Treating the front and rear as the same operation"],
  },
  {
    slug: "linked-list",
    title: "Linked List",
    subject: "Computer Science",
    topic: "Data Structures",
    definition: "A linked list is a linear collection of nodes. Each node stores data and one or more links to other nodes; nodes do not need to occupy contiguous memory locations.",
    examples: ["A singly linked list with next pointers", "A doubly linked list with previous and next pointers"],
    relatedConcepts: ["Array", "Stack", "Queue"],
    commonMistakes: ["Assuming nodes are stored contiguously", "Forgetting to update links when inserting or deleting nodes"],
  },
  {
    slug: "binary-search",
    title: "Binary Search",
    subject: "Computer Science",
    topic: "Searching and Sorting",
    definition: "Binary search finds a target in a sorted sequence by repeatedly comparing the target with the middle element and discarding the half that cannot contain it.",
    examples: ["Finding a value in an ascending sorted array", "Looking up a word in an alphabetically sorted list"],
    relatedConcepts: ["Linear Search", "Sorting", "Time Complexity"],
    commonMistakes: ["Applying binary search to unsorted data", "Updating the search bounds incorrectly and skipping a possible match"],
  },
  {
    slug: "process-and-thread",
    title: "Process and Thread",
    subject: "Computer Science",
    topic: "Operating Systems",
    definition: "A process is a program in execution with its own process resources and address space. A thread is an execution path within a process; threads in the same process share process resources while maintaining their own execution state.",
    examples: ["Two independent text-editor processes", "Multiple worker threads inside one application"],
    relatedConcepts: ["CPU Scheduling", "Context Switch", "Concurrency"],
    commonMistakes: ["Assuming threads in one process have completely separate address spaces", "Treating a program file and a running process as identical"],
  },
  {
    slug: "normalization",
    title: "Database Normalization",
    subject: "Computer Science",
    topic: "Database Management Systems",
    definition: "Database normalization organizes relational tables to reduce avoidable data redundancy and prevent insertion, update, and deletion anomalies by applying normal forms.",
    examples: ["Separating customer details from orders", "Moving repeating product data into a related product table"],
    relatedConcepts: ["Primary Key", "Foreign Key", "Functional Dependency"],
    commonMistakes: ["Assuming normalization means splitting every column into a separate table", "Ignoring functional dependencies when choosing a normal form"],
  },
  {
    slug: "primary-and-foreign-keys",
    title: "Primary Key and Foreign Key",
    subject: "Computer Science",
    topic: "Database Management Systems",
    definition: "A primary key uniquely identifies each row in a table. A foreign key is a column or set of columns that references a candidate key, commonly the primary key, in another table and helps enforce referential integrity.",
    examples: ["Student.student_id as a primary key", "Enrollment.student_id referencing Student.student_id"],
    relatedConcepts: ["Relational Model", "Normalization", "Referential Integrity"],
    commonMistakes: ["Assuming a foreign key must be unique", "Confusing a primary key with a descriptive attribute"],
  },
  {
    slug: "osi-model",
    title: "OSI Model",
    subject: "Computer Science",
    topic: "Computer Networks",
    definition: "The OSI reference model describes network communication using seven layers: Physical, Data Link, Network, Transport, Session, Presentation, and Application.",
    examples: ["Routing is associated with the Network layer", "Reliable end-to-end transport is associated with the Transport layer"],
    relatedConcepts: ["TCP/IP Model", "IP Address", "TCP and UDP"],
    commonMistakes: ["Mixing up the order of the seven layers", "Confusing the Network layer with the Transport layer"],
  },
  {
    slug: "newtons-second-law",
    title: "Newton's Second Law of Motion",
    subject: "Physics",
    topic: "Laws of Motion",
    definition: "For constant mass, the net force on an object equals its mass multiplied by its acceleration: F = ma.",
    examples: ["A larger net force produces greater acceleration for the same mass", "The same net force produces less acceleration for a larger mass"],
    relatedConcepts: ["Force", "Mass", "Acceleration"],
    commonMistakes: ["Using the applied force instead of the net force when other forces act", "Confusing mass with weight"],
  },
  {
    slug: "ohms-law",
    title: "Ohm's Law",
    subject: "Physics",
    topic: "Current Electricity",
    definition: "For a conductor under constant physical conditions, the potential difference across it is proportional to the current through it: V = IR.",
    examples: ["Calculating voltage from current and resistance", "Calculating current in a resistive circuit"],
    relatedConcepts: ["Voltage", "Current", "Resistance"],
    commonMistakes: ["Mixing voltage and current units", "Applying the relation without checking whether the conductor is ohmic under the stated conditions"],
  },
];

export interface ConceptSearchOptions {
  query?: string;
  subject?: string;
  limit?: number;
}

export function listLearningConcepts(options: ConceptSearchOptions = {}): LearningConcept[] {
  const query = options.query?.trim().toLocaleLowerCase();
  const subject = options.subject?.trim().toLocaleLowerCase();
  const filtered = CONCEPTS.filter((concept) => {
    if (subject && concept.subject.toLocaleLowerCase() !== subject) return false;
    if (!query) return true;
    const searchable = [
      concept.title,
      concept.subject,
      concept.topic,
      concept.definition,
      ...concept.examples,
      ...concept.relatedConcepts,
      ...concept.commonMistakes,
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });
  return filtered.slice(0, Math.max(1, Math.min(options.limit ?? 50, 50)));
}

export function getLearningConcept(slug: string): LearningConcept | null {
  return CONCEPTS.find((concept) => concept.slug === slug) ?? null;
}


export interface RelatedLearningConcept {
  slug: string;
  title: string;
}

/** Match only an exact curated topic label; never guess from question wording. */
export function getLearningConceptsForTopic(topic: string | null | undefined): RelatedLearningConcept[] {
  const normalizedTopic = topic?.trim().toLocaleLowerCase();
  if (!normalizedTopic) return [];
  return CONCEPTS
    .filter((concept) => concept.topic.toLocaleLowerCase() === normalizedTopic)
    .map(({ slug, title }) => ({ slug, title }));
}
