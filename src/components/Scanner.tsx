import React, { useState, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, Loader2, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { convertPdfToImages } from '@/src/lib/pdf';
import { extractMarksheetData, MarksheetData } from '@/src/lib/gemini';
import { cn } from '@/src/lib/utils';
import Papa from 'papaparse';

interface ExtractedRecord extends MarksheetData {
  id: string;
  pageNumber: number;
}

export default function Scanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [records, setRecords] = useState<ExtractedRecord[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setRecords([]);

    try {
      const images = await convertPdfToImages(file).catch(err => {
        console.error('PDF Conversion Error:', err);
        throw new Error(`Failed to read PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      });
      
      if (images.length === 0) {
        setError('No pages found in the PDF file.');
        setIsScanning(false);
        return;
      }
      
      setProgress({ current: 0, total: images.length });

      const newRecords: ExtractedRecord[] = [];
      let lastInstitution = "";

      // Process pages in batches to avoid rate limits while maintaining speed
      const BATCH_SIZE = 3;
      const results: (ExtractedRecord | null)[] = new Array(images.length).fill(null);

      for (let i = 0; i < images.length; i += BATCH_SIZE) {
        const batch = images.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (image, index) => {
          const pageIdx = i + index;
          try {
            const data = await extractMarksheetData(image);
            setProgress(prev => ({ ...prev, current: prev.current + 1 }));
            
            if (data) {
              // Normalize status
              let status = data.resultStatus?.trim() || '';
              if (status.toLowerCase().includes('pass')) status = 'Pass';
              else if (status.toLowerCase().includes('fail')) status = 'Fail';
              data.resultStatus = status;

              // Ensure subjects have subjectName
              data.subjects = data.subjects.map(s => ({
                ...s,
                subjectName: s.subjectName || (s as any).subject || ''
              }));

              results[pageIdx] = {
                ...data,
                id: crypto.randomUUID(),
                pageNumber: pageIdx + 1
              };
            }
          } catch (pageErr) {
            console.error(`Error on page ${pageIdx + 1}:`, pageErr);
            setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          }
        });

        await Promise.all(batchPromises);
      }
      
      // Filter out nulls and sort by page number
      const validRecords = (results.filter(r => r !== null) as ExtractedRecord[])
        .sort((a, b) => a.pageNumber - b.pageNumber);

      // Post-process to inherit institution names sequentially
      validRecords.forEach(record => {
        if (record.institutionName) {
          lastInstitution = record.institutionName;
        } else if (lastInstitution) {
          record.institutionName = lastInstitution;
        }
      });

      if (validRecords.length === 0) {
        setError('Failed to extract any data from the PDF. Please ensure it contains readable marksheets.');
      } else {
        setRecords(validRecords);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred while processing the PDF.');
    } finally {
      setIsScanning(false);
    }
  };

  const exportToCsv = () => {
    if (records.length === 0) return;

    // Use a map to ensure unique subject columns based on code or name
    const subjectMap = new Map<string, string>(); // key -> display name
    records.forEach(r => r.subjects.forEach(s => {
      const key = s.subjectCode?.trim() || s.subjectName?.trim();
      if (key && !subjectMap.has(key)) {
        const displayName = s.subjectCode ? `${s.subjectCode.trim()} - ${s.subjectName.trim()}` : s.subjectName.trim();
        subjectMap.set(key, displayName);
      }
    }));

    const subjectColumns = Array.from(subjectMap.values());
    const subjectKeys = Array.from(subjectMap.keys());

    // Create one row per student
    const csvData = records.map(record => {
      const row: Record<string, any> = {
        'Student Name': record.studentName,
        'Roll Number': record.rollNumber,
        'Institution': record.institutionName,
        'Total Obtained': record.totalMarksObtained,
        'Total Max': record.totalMaxMarks,
        'Percentage': record.percentage,
        'Result Status': record.resultStatus,
      };

      // Initialize subject columns
      subjectColumns.forEach(col => {
        row[col] = '';
      });

      // Fill subject data
      record.subjects.forEach(s => {
        const key = s.subjectCode?.trim() || s.subjectName?.trim();
        const colName = subjectMap.get(key);
        if (colName) {
          const gradeStr = s.grade && s.grade !== 'null' ? s.grade : '';
          if (gradeStr && (!s.marksObtained || s.marksObtained === '0' || s.marksObtained === 0)) {
            row[colName] = gradeStr;
          } else {
            row[colName] = `${s.marksObtained}/${s.maxMarks}${gradeStr ? ` (${gradeStr})` : ''}`;
          }
        }
      });

      // Add Page at the end
      row['Page'] = record.pageNumber;

      return row;
    });

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `marksheet_data_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeRecord = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const updateRecord = (id: string, field: keyof MarksheetData, value: any) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-2xl text-blue-600 mb-4"
        >
          <FileText size={32} />
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl"
        >
          Grade2Data
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg text-gray-600 max-w-2xl mx-auto"
        >
          Upload your marksheet PDFs and let AI extract the data into a clean, exportable CSV format.
        </motion.p>
      </div>

      {/* Upload Section */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="relative"
      >
        <div className={cn(
          "relative group border-2 border-dashed rounded-3xl p-12 transition-all duration-300 flex flex-col items-center justify-center space-y-4",
          isScanning ? "border-blue-300 bg-blue-50/30" : "border-gray-200 hover:border-blue-400 hover:bg-gray-50"
        )}>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={isScanning}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          
          {isScanning ? (
            <div className="flex flex-col items-center space-y-4 text-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <div className="space-y-2">
                <p className="text-xl font-semibold text-gray-900">Scanning PDF...</p>
                <p className="text-gray-500">Processing page {progress.current} of {progress.total}</p>
              </div>
              <div className="w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-gray-900">Click or drag PDF here</p>
                <p className="text-gray-500 mt-1">Supports multi-page student marksheet PDFs</p>
              </div>
            </>
          )}
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700"
          >
            <AlertCircle size={20} />
            <p>{error}</p>
          </motion.div>
        )}
      </motion.div>

      {/* Results Section */}
      <AnimatePresence>
        {records.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">Extracted Records</h2>
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                  {records.length} {records.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>
              <button
                onClick={exportToCsv}
                className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 font-medium"
              >
                <Download size={20} />
                Export to CSV
              </button>
            </div>

            <div className="grid gap-6">
              {records.map((record, idx) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden group"
                >
                  <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 text-gray-400 font-mono text-sm">
                        {record.pageNumber}
                      </div>
                      <div>
                        <input
                          className="text-lg font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full"
                          value={record.studentName}
                          onChange={(e) => updateRecord(record.id, 'studentName', e.target.value)}
                          placeholder="Student Name"
                        />
                        <input
                          className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 w-full"
                          value={record.institutionName}
                          onChange={(e) => updateRecord(record.id, 'institutionName', e.target.value)}
                          placeholder="Institution Name"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={() => removeRecord(record.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                  
                  <div className="p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="pb-4 font-semibold text-gray-400 text-xs uppercase tracking-wider w-24">Code</th>
                            <th className="pb-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">Subject</th>
                            <th className="pb-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">Marks</th>
                            <th className="pb-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">Max</th>
                            <th className="pb-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {record.subjects.map((sub, sIdx) => (
                            <tr key={sIdx} className="group/row">
                              <td className="py-4 pr-2">
                                <input
                                  className="text-sm font-mono text-gray-500 bg-transparent border-none focus:ring-0 p-0 w-full"
                                  value={sub.subjectCode || ''}
                                  placeholder="Code"
                                  onChange={(e) => {
                                    const newSubjects = [...record.subjects];
                                    newSubjects[sIdx].subjectCode = e.target.value;
                                    updateRecord(record.id, 'subjects', newSubjects);
                                  }}
                                />
                              </td>
                              <td className="py-4">
                                <input
                                  className="text-sm font-medium text-gray-700 bg-transparent border-none focus:ring-0 p-0 w-full"
                                  value={sub.subjectName}
                                  placeholder="Subject Name"
                                  onChange={(e) => {
                                    const newSubjects = [...record.subjects];
                                    newSubjects[sIdx].subjectName = e.target.value;
                                    updateRecord(record.id, 'subjects', newSubjects);
                                  }}
                                />
                              </td>
                              <td className="py-4">
                                <input
                                  className="text-sm font-mono text-gray-600 bg-transparent border-none focus:ring-0 p-0 w-20"
                                  value={sub.marksObtained}
                                  onChange={(e) => {
                                    const newSubjects = [...record.subjects];
                                    newSubjects[sIdx].marksObtained = e.target.value;
                                    updateRecord(record.id, 'subjects', newSubjects);
                                  }}
                                />
                              </td>
                              <td className="py-4">
                                <input
                                  className="text-sm font-mono text-gray-600 bg-transparent border-none focus:ring-0 p-0 w-20"
                                  value={sub.maxMarks}
                                  onChange={(e) => {
                                    const newSubjects = [...record.subjects];
                                    newSubjects[sIdx].maxMarks = e.target.value;
                                    updateRecord(record.id, 'subjects', newSubjects);
                                  }}
                                />
                              </td>
                              <td className="py-4">
                                <input
                                  className="text-sm font-semibold text-blue-600 bg-transparent border-none focus:ring-0 p-0 w-16"
                                  value={sub.grade}
                                  onChange={(e) => {
                                    const newSubjects = [...record.subjects];
                                    newSubjects[sIdx].grade = e.target.value;
                                    updateRecord(record.id, 'subjects', newSubjects);
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 pt-6 border-t border-gray-50 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-gray-400 uppercase font-semibold">Roll Number</p>
                        <input
                          className="text-sm font-medium text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full"
                          value={record.rollNumber}
                          onChange={(e) => updateRecord(record.id, 'rollNumber', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-400 uppercase font-semibold">Total Marks</p>
                        <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                          <input
                            className="bg-transparent border-none focus:ring-0 p-0 w-12"
                            value={record.totalMarksObtained}
                            onChange={(e) => updateRecord(record.id, 'totalMarksObtained', e.target.value)}
                          />
                          <span>/</span>
                          <input
                            className="bg-transparent border-none focus:ring-0 p-0 w-12"
                            value={record.totalMaxMarks}
                            onChange={(e) => updateRecord(record.id, 'totalMaxMarks', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-400 uppercase font-semibold">Percentage</p>
                        <input
                          className="text-sm font-medium text-gray-900 bg-transparent border-none focus:ring-0 p-0 w-full"
                          value={record.percentage}
                          onChange={(e) => updateRecord(record.id, 'percentage', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-400 uppercase font-semibold">Status</p>
                        <input
                          className={cn(
                            "text-sm font-bold bg-transparent border-none focus:ring-0 p-0 w-full",
                            record.resultStatus.toLowerCase().includes('pass') ? "text-green-600" : "text-red-600"
                          )}
                          value={record.resultStatus}
                          onChange={(e) => updateRecord(record.id, 'resultStatus', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!isScanning && records.length === 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-4"
        >
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
            <CheckCircle2 size={32} />
          </div>
          <p className="text-lg">No records extracted yet. Upload a PDF to begin.</p>
        </motion.div>
      )}
    </div>
  );
}
