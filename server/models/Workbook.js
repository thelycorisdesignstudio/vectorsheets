import mongoose from 'mongoose';

const ChartSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['bar', 'line', 'none'], default: 'none' },
    labelColumn: { type: Number, default: 0 },
    valueColumn: { type: Number, default: 1 },
    title: { type: String, default: '' }
  },
  { _id: false }
);

const WorkbookSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    owner: { type: String, default: 'SuperOrbit Studio' },
    status: { type: String, default: 'Live model' },
    prompt: { type: String, default: '' },
    grid: { type: [[String]], default: [] },
    summary: { type: String, default: '' },
    chart: { type: ChartSchema, default: () => ({ type: 'none' }) },
    tags: { type: [String], default: [] },
    activity: {
      aiRuns: { type: Number, default: 0 },
      formulaCells: { type: Number, default: 0 },
      lastAction: { type: String, default: 'Created workbook' }
    }
  },
  { timestamps: true }
);

WorkbookSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  }
});

export default mongoose.models.Workbook || mongoose.model('Workbook', WorkbookSchema);
