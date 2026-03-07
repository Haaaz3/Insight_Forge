# Insight Forge - Claude Code Onboarding

This document provides essential context for Claude Code sessions working on Insight Forge.

## Project Overview

**Insight Forge** is a clinical quality measure (CQM) development platform that transforms 50+ page PDF measure specifications into executable code (CQL, SQL) using AI-assisted extraction, a reusable component library, and automated validation.

**Problem solved:** What traditionally takes 2-4 weeks per measure now takes 2-4 hours.

## Quick Start

```bash
# Frontend (React + Vite)
npm install
npm run dev
# Runs at http://localhost:5173

# Backend (Spring Boot)
cd backend
./mvnw spring-boot:run
# Runs at http://localhost:8080
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 7, Tailwind CSS 4, Zustand 5 |
| Backend | Spring Boot 3.2, Java 17, H2 (dev) / PostgreSQL (prod) |
| AI Providers | Anthropic Claude, OpenAI GPT, Google Gemini |
| Deployment | Frontend: Vercel, Backend: Railway |

## Project Structure

```
src/
├── components/           # React UI components
│   ├── copilot/         # AND/OR.ai Co-Pilot chat interface
│   ├── ingestion/       # Document import UI (CatalogueConfirmationChip)
│   ├── layout/          # App shell (Sidebar)
│   ├── library/         # Component Library UI
│   ├── measure/         # UMS Editor, MeasureLibrary, CodeGeneration
│   ├── settings/        # Settings page with feedback dashboard
│   ├── validation/      # Test patient validation
│   └── valueset/        # Value set management
├── services/            # Business logic and generators
│   ├── measureIngestion.ts   # Document parsing
│   ├── cqlGenerator.ts       # CQL code generation
│   ├── hdiSqlGenerator.ts    # SQL code generation
│   ├── copilotService.ts     # AI Co-Pilot context
│   └── extractionService.js  # AI extraction with feedback
├── stores/              # Zustand state management
│   ├── measureStore.js       # Measures, active tab, code overrides
│   ├── componentLibraryStore.js  # Reusable components
│   ├── feedbackStore.js      # Extraction corrections
│   └── settingsStore.js      # User preferences, API keys
├── utils/               # Utility functions
│   └── catalogueClassifier.js # Document type detection
├── api/                 # Backend API clients
│   └── classifierFeedback.js  # Classifier feedback API
└── types/               # TypeScript definitions

backend/
├── src/main/java/com/algoaccel/
│   ├── controller/      # REST endpoints
│   ├── service/         # Business logic
│   ├── model/           # JPA entities
│   └── repository/      # Spring Data repositories
└── src/main/resources/
    └── db/migration/    # Flyway migrations
```

## Key Concepts

### Universal Measure Spec (UMS)
The canonical data model representing a clinical quality measure. Contains:
- Metadata (title, ID, measurement period)
- Populations (IPP, Denominator, Numerator, Exclusions)
- Criteria tree (AND/OR/NOT clauses with DataElements)
- Value sets with codes

### Component Library
Reusable building blocks:
- **Atomic**: Single value set + timing (e.g., "Office Visit during MP")
- **Composite**: Collection with AND/OR logic (created via merge)

### Ingestion Pipeline
1. Upload PDF/Word document
2. **Catalogue auto-detect**: Classify as eCQM, MIPS_CQM, HEDIS, QOF, or Clinical_Standard
3. AI extraction with feedback injection (learns from past corrections)
4. Component auto-linking to library
5. User review and refinement

## Key Documentation Files

| File | Purpose |
|------|---------|
| `PRODUCT_GUIDE.md` | User-facing feature documentation |
| `TECH_SPECS.md` | Technical specifications, data models, services |
| `WIRING_MANIFEST.md` | Component-store connections, data flows |
| `docs/TECHNICAL_ARCHITECTURE.md` | Code structure and patterns |
| `docs/PRODUCT_OVERVIEW.md` | High-level product description |

## Common Tasks

### Run the Application
```bash
# Terminal 1: Backend
cd backend && ./mvnw spring-boot:run

# Terminal 2: Frontend
npm run dev
```

### Run Tests
```bash
npm run test        # Run once
npm run test:watch  # Watch mode
```

### Build for Production
```bash
npm run build       # Output to dist/
```

## Recent Features

### Feature 1c: Easy HEDIS — NDC, Collection Type, Hybrid Source (March 2026)
**Task 1 Complete: V22 Migration + catalogueDefaults**
- `V22__add_catalogue_defaults_to_components.sql` - Adds `catalogue_defaults TEXT` column to `library_component`
- `LibraryComponent.java` - Added `catalogueDefaults` field (JSON string)
- `ComponentDto.java` - Added `catalogueDefaults` as `Map<String, Object>`
- `CreateAtomicComponentRequest.java`, `CreateCompositeComponentRequest.java`, `UpdateComponentRequest.java` - Added `catalogueDefaults`
- `ComponentMapper.java` - Added `parseCatalogueDefaults()` and `serializeCatalogueDefaults()` methods
- `ComponentLibraryService.java` - Updated `mergeUpdates()` to handle `catalogueDefaults`

**Design decision:** `catalogueDefaults` stores suggested defaults (e.g., `{"hedis": {"collectionType": "administrative", "hybridSourceFlag": false}}`). The actual HEDIS fields live on data elements within the measure's UMS, not on the library component.

**Task 2 Complete: hedis block on data elements**
- `extractionService.js` - Added `isHedisApplicableType()` helper and hedis block population in `convertCriteria()`
- `transformers.js` - Added hedis block preservation in `transformDataElement()`
- `measureStore.js` - Updated both `importMeasure` and `addMeasure` to populate hedis block from component's catalogueDefaults when linking

**HEDIS-applicable element types:** encounter, procedure, laboratory, medication, condition (diagnosis)
**hedis block structure:** `{ collectionType: "administrative"|"hybrid"|"ecd"|"ecds"|null, hybridSourceFlag: boolean }`

**Task 3 Complete: AI infers collection type at HEDIS ingest**
- `extractionService.js` - Added HEDIS-specific LLM prompt instructions for collectionType/hybridSourceFlag inference
- `multiPassExtractor.js` - Added HEDIS guidance and JSON schema extension in `getPopulationDetailPrompt()`

**LLM guidance:** When catalogue is HEDIS, the prompt instructs the AI to:
- Infer collectionType from spec (administrative, hybrid, ecd, ecds)
- Default to "administrative" if uncertain
- Set hybridSourceFlag=true only for medical record review elements

**Task 4 Complete: HEDIS fields in UMS editor**
- `UMSEditor.jsx` - Added HEDIS Collection section to `NodeDetailPanel` with:
  - Collection Type dropdown (administrative, hybrid, ecd, ecds)
  - Hybrid Source Flag checkbox
  - Only visible for HEDIS measures on applicable element types

### Feature 1b: Catalogue Auto-Detection (March 2026)
- `src/utils/catalogueClassifier.js` - Signal-based document classifier
- `src/components/ingestion/CatalogueConfirmationChip.jsx` - Confirmation UI
- `src/api/classifierFeedback.js` - Feedback API client
- Backend: `ClassifierFeedbackController.java`, `V21__create_classifier_feedback_table.sql`

### Feature 1a: Catalogue Tagging (February 2026)
- Standardized "Catalogue" spelling in user-facing strings
- Added catalogue type badges to component library

### Extraction Feedback System (February 2026)
- `src/stores/feedbackStore.js` - Captures user corrections
- Prompt injection into AI extraction prompts
- Feedback dashboard in Settings

## State Management

Zustand stores with localStorage persistence:
- `measure-storage` - Measures and selections
- `component-library-storage` - Library components
- `settings-storage` - API keys and preferences
- `feedback-storage` - Extraction corrections

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/measures` | GET/POST | List/create measures |
| `/api/measures/{id}` | GET/PUT/DELETE | Measure CRUD |
| `/api/components` | GET/POST | List/create components |
| `/api/import` | POST | Import with auto-component creation |
| `/api/classifier/feedback` | POST | Record catalogue classification feedback |

## Code Patterns

### Stale Closure Fix (useRef)
Used in MeasureLibrary.jsx to prevent stale closures in useCallback:
```javascript
const continueIngestionRef = useRef(null);
useEffect(() => {
  continueIngestionRef.current = continueIngestion;
}, [continueIngestion]);
```

### Store Key Pattern
Code overrides keyed by `measureId::elementId`:
```javascript
const storeKey = getStoreKey(measureId, elementId);
// Returns: "measure-123::element-456"
```

## Development Notes

- API keys stored in localStorage (Settings page)
- Direct LLM API calls when frontend key configured (faster)
- Backend proxy as fallback for extraction
- All component IDs use `comp-` or `composite-` prefix
- Flyway migrations in `backend/src/main/resources/db/migration/`

## Helpful Commands

```bash
# Kill processes on port 8080
lsof -ti:8080 | xargs kill -9

# Check backend logs
tail -f backend/target/logs/application.log

# Database console (H2)
# Open http://localhost:8080/h2-console
# JDBC URL: jdbc:h2:file:./data/algoaccel
```

## Git Workflow

- Main branch: `main`
- Feature branches: `feature/1b-catalogue-autodetect`
- Commit format: `feat:`, `fix:`, `docs:`, `refactor:`
- Push to production: `git push origin main`
