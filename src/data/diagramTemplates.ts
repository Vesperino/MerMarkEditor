export interface DiagramTemplate {
  name: string;
  code: string;
}

export interface DiagramCategory {
  categoryKey: string;
  templates: DiagramTemplate[];
}

// Full categorized templates for modal
export const diagramCategories: DiagramCategory[] = [
  {
    categoryKey: 'categoryBasic',
    templates: [
      {
        name: "Flowchart",
        code: "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action 1]\n  B -->|No| D[Action 2]\n  C --> E[End]\n  D --> E"
      },
      {
        name: "Flowchart LR",
        code: "graph LR\n  A[Input] --> B[Process]\n  B --> C[Output]\n  B --> D[Error]\n  D --> B"
      },
      {
        name: "Sequence",
        code: "sequenceDiagram\n  participant U as User\n  participant S as System\n  participant D as Database\n  U->>S: Request\n  S->>D: Query\n  D-->>S: Result\n  S-->>U: Response"
      },
      {
        name: "Class",
        code: "classDiagram\n  class Animal {\n    +String name\n    +int age\n    +makeSound()\n  }\n  class Dog {\n    +String breed\n    +bark()\n  }\n  class Cat {\n    +meow()\n  }\n  Animal <|-- Dog\n  Animal <|-- Cat"
      },
    ]
  },
  {
    categoryKey: 'categoryStatesProcesses',
    templates: [
      {
        name: "State",
        code: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Processing : Start\n  Processing --> Success : Complete\n  Processing --> Error : Fail\n  Success --> [*]\n  Error --> Idle : Retry"
      },
      {
        name: "Gantt",
        code: "gantt\n  title Project Plan\n  dateFormat YYYY-MM-DD\n  section Phase 1\n    Task 1 :a1, 2024-01-01, 30d\n    Task 2 :after a1, 20d\n  section Phase 2\n    Task 3 :2024-02-15, 25d\n    Task 4 :2024-03-01, 15d"
      },
      {
        name: "Journey",
        code: "journey\n  title User Journey\n  section Registration\n    Visit site: 5: User\n    Fill form: 3: User\n    Confirm email: 4: User\n  section Usage\n    Login: 5: User\n    Browse: 4: User\n    Purchase: 3: User"
      },
    ]
  },
  {
    categoryKey: 'categoryDataRelations',
    templates: [
      {
        name: "ER Diagram",
        code: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains\n  PRODUCT ||--o{ LINE-ITEM : \"ordered in\"\n  CUSTOMER {\n    string name\n    string email\n  }\n  ORDER {\n    int id\n    date created\n  }"
      },
      {
        name: "Pie Chart",
        code: "pie showData\n  title Project Distribution\n  \"Development\" : 45\n  \"Testing\" : 25\n  \"Documentation\" : 15\n  \"Deployment\" : 15"
      },
      {
        name: "Mindmap",
        code: "mindmap\n  root((Project))\n    Backend\n      API\n      Database\n      Auth\n    Frontend\n      Components\n      Styles\n      State\n    DevOps\n      CI/CD\n      Monitoring"
      },
      {
        name: "Timeline",
        code: "timeline\n  title Project Timeline\n  section 2024 Q1\n    January : Planning\n    February : Development\n    March : Testing\n  section 2024 Q2\n    April : Beta release\n    May : Feedback\n    June : Production"
      },
    ]
  },
  {
    categoryKey: 'categoryGitRequirements',
    templates: [
      {
        name: "Gitgraph",
        code: "gitGraph\n  commit id: \"Initial\"\n  branch develop\n  checkout develop\n  commit id: \"Feature A\"\n  commit id: \"Feature B\"\n  checkout main\n  merge develop id: \"v1.0\"\n  commit id: \"Hotfix\"\n  branch feature\n  commit id: \"New feature\""
      },
      {
        name: "Requirement",
        code: "requirementDiagram\n  requirement user_req {\n    id: 1\n    text: User authentication\n    risk: high\n    verifymethod: test\n  }\n  element auth_module {\n    type: module\n  }\n  auth_module - satisfies -> user_req"
      },
    ]
  },
  {
    categoryKey: 'categoryC4Model',
    templates: [
      {
        name: "C4 Context",
        code: "C4Context\n  title System Context Diagram\n\n  Person(user, \"User\", \"End user of the system\")\n  System(mainSystem, \"Main System\", \"Core application\")\n  System_Ext(extSystem, \"External System\", \"Third-party service\")\n\n  Rel(user, mainSystem, \"Uses\")\n  Rel(mainSystem, extSystem, \"Calls API\")"
      },
      {
        name: "C4 Container",
        code: "C4Container\n  title Container Diagram\n\n  Person(user, \"User\", \"System user\")\n\n  System_Boundary(system, \"System\") {\n    Container(webapp, \"Web App\", \"Vue.js\", \"Frontend application\")\n    Container(api, \"API\", \"Node.js\", \"Backend API\")\n    ContainerDb(db, \"Database\", \"PostgreSQL\", \"Data storage\")\n  }\n\n  Rel(user, webapp, \"Uses\", \"HTTPS\")\n  Rel(webapp, api, \"Calls\", \"REST/JSON\")\n  Rel(api, db, \"Reads/Writes\")"
      },
      {
        name: "C4 Component",
        code: "C4Component\n  title Component Diagram\n\n  Container_Boundary(api, \"API Application\") {\n    Component(auth, \"Auth Controller\", \"TypeScript\", \"Handles authentication\")\n    Component(users, \"User Controller\", \"TypeScript\", \"User management\")\n    Component(service, \"User Service\", \"TypeScript\", \"Business logic\")\n    Component(repo, \"User Repository\", \"TypeScript\", \"Data access\")\n  }\n\n  Rel(auth, service, \"Uses\")\n  Rel(users, service, \"Uses\")\n  Rel(service, repo, \"Uses\")"
      },
      {
        name: "C4 Dynamic",
        code: "C4Dynamic\n  title Dynamic Diagram - Login Flow\n\n  Person(user, \"User\")\n  Container(spa, \"SPA\", \"Vue.js\")\n  Container(api, \"API\", \"Node.js\")\n  ContainerDb(db, \"DB\", \"PostgreSQL\")\n\n  Rel(user, spa, \"1. Enter credentials\")\n  Rel(spa, api, \"2. POST /login\")\n  Rel(api, db, \"3. Verify user\")\n  Rel(api, spa, \"4. Return JWT\")\n  Rel(spa, user, \"5. Show dashboard\")"
      },
      {
        name: "C4 Deployment",
        code: "C4Deployment\n  title Deployment Diagram\n\n  Deployment_Node(cloud, \"Cloud Provider\") {\n    Deployment_Node(k8s, \"Kubernetes Cluster\") {\n      Container(webapp, \"Web App\", \"Vue.js\")\n      Container(api, \"API\", \"Node.js\")\n    }\n    Deployment_Node(db_server, \"Database Server\") {\n      ContainerDb(db, \"Database\", \"PostgreSQL\")\n    }\n  }\n\n  Rel(webapp, api, \"Calls\")\n  Rel(api, db, \"Reads/Writes\")"
      },
    ]
  },
  {
    categoryKey: 'categoryAdvanced',
    templates: [
      {
        name: "Sankey",
        code: "sankey-beta\n\nSource A,Target X,50\nSource A,Target Y,30\nSource B,Target X,20\nSource B,Target Z,40\nTarget X,Final,70\nTarget Y,Final,30\nTarget Z,Final,40"
      },
      {
        name: "XY Chart",
        code: "xychart-beta\n  title \"Sales Data\"\n  x-axis [jan, feb, mar, apr, may, jun]\n  y-axis \"Revenue\" 0 --> 100\n  bar [20, 35, 45, 60, 55, 80]\n  line [15, 30, 40, 55, 50, 75]"
      },
      {
        name: "Block",
        code: "block-beta\n  columns 3\n  Frontend:3\n  space down1<[\" \"]>(down) space\n  Backend\n  space down2<[\" \"]>(down)\n  Database"
      },
    ]
  },
];

// Flat list of popular templates for quick access buttons
export const quickAccessTemplates: DiagramTemplate[] = [
  { name: "Flowchart", code: "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action 1]\n  B -->|No| D[Action 2]\n  C --> E[End]\n  D --> E" },
  { name: "Sequence", code: "sequenceDiagram\n  participant U as User\n  participant S as System\n  U->>S: Request\n  S-->>U: Response" },
  { name: "Class", code: "classDiagram\n  class Animal {\n    +String name\n    +makeSound()\n  }\n  class Dog\n  Animal <|-- Dog" },
  { name: "State", code: "stateDiagram-v2\n  [*] --> Active\n  Active --> Inactive\n  Inactive --> [*]" },
  { name: "ER", code: "erDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains" },
  { name: "Gantt", code: "gantt\n  title Plan\n  Task 1 :a1, 2024-01-01, 30d\n  Task 2 :after a1, 20d" },
  { name: "Pie", code: "pie\n  \"A\" : 40\n  \"B\" : 30\n  \"C\" : 30" },
  { name: "Mindmap", code: "mindmap\n  root((Main))\n    Topic A\n    Topic B\n    Topic C" },
];
