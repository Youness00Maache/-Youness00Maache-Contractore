# My PDF App

## Overview
My PDF App is a TypeScript-based application designed to generate PDF documents from various templates. It provides functionality for creating daily job reports and notes, adapting templates based on document types to ensure clean and user-friendly outputs.

## Features
- Generate PDF documents for invoices, estimates, daily reports, and notes.
- Adapt templates dynamically based on document type.
- Clean layouts for daily reports and notes without unnecessary tables.
- Preserved header, footer, and signature sections in all templates.

## Project Structure
```
my-pdf-app
├── src
│   ├── index.ts               # Entry point for the application
│   ├── services
│   │   └── pdfGenerator.ts     # Functions for generating PDF documents
│   ├── templates
│   │   └── index.ts            # Exports various HTML templates
│   └── types
│       └── index.ts            # TypeScript types and interfaces
├── services
│   └── pdfGenerator.ts         # Duplicate of src/services/pdfGenerator.ts
├── utils
│   └── templates
│       └── templateAdapters.ts  # Adapter functions for template transformation
├── package.json                # npm configuration file
├── tsconfig.json               # TypeScript configuration file
└── README.md                   # Documentation for the project
```

## Installation
1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd my-pdf-app
   ```
3. Install dependencies:
   ```
   npm install
   ```

## Usage
To generate a PDF document, call the appropriate function from the `pdfGenerator` service, passing in the necessary parameters such as user profile, data, and template ID.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.