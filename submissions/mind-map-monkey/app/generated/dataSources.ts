/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export default {
  "onedriveforbusiness": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "GetFileMetadata": {
        "path": "/{connectionId}/datasets/default/files/{id}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateFile": {
        "path": "/{connectionId}/datasets/default/files/{id}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DeleteFile": {
        "path": "/{connectionId}/datasets/default/files/{id}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetFileMetadataByPath": {
        "path": "/{connectionId}/datasets/default/GetFileByPath",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "path",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateShareLink": {
        "path": "/{connectionId}/datasets/default/files/{id}/share",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "scope",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateShareLinkV2": {
        "path": "/{connectionId}/datasets/default/files/{id}/shareV2",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "scope",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateShareLinkByPath": {
        "path": "/{connectionId}/datasets/default/CreateShareLinkByPath",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "path",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "scope",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateShareLinkByPathV2": {
        "path": "/{connectionId}/datasets/default/CreateShareLinkByPathV2",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "path",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "scope",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetFileContentByPath": {
        "path": "/{connectionId}/datasets/default/GetFileContentByPath",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "path",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "inferContentType",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetFileContent": {
        "path": "/{connectionId}/datasets/default/files/{id}/content",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "inferContentType",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateFile": {
        "path": "/{connectionId}/datasets/default/files",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "folderPath",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "name",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CopyFile": {
        "path": "/{connectionId}/datasets/default/copyFile",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "source",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "destination",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "overwrite",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CopyDriveFile": {
        "path": "/{connectionId}/datasets/default/files/{id}/copy",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "destination",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "overwrite",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CopyDriveFileByPath": {
        "path": "/{connectionId}/datasets/default/CopyFileByPath",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "source",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "destination",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "overwrite",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "MoveFile": {
        "path": "/{connectionId}/datasets/default/files/{id}/move",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "destination",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "overwrite",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "MoveFileByPath": {
        "path": "/{connectionId}/datasets/default/MoveFileByPath",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "source",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "destination",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "overwrite",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ConvertFile": {
        "path": "/{connectionId}/datasets/default/files/{id}/convert",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ConvertFileByPath": {
        "path": "/{connectionId}/datasets/default/ConvertFileByPath",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "path",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetFileThumbnail": {
        "path": "/{connectionId}/datasets/default/files/{id}/thumbnail",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "size",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnNewFileV2": {
        "path": "/{connectionId}/datasets/default/triggers/onnewfilev2",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "folderId",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "includeSubfolders",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "inferContentType",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "simulate",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "x-ms-operation-context",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnUpdatedFileV2": {
        "path": "/{connectionId}/datasets/default/triggers/onupdatedfilev2",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "folderId",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "includeSubfolders",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "includeFileContent",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "inferContentType",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "simulate",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "x-ms-operation-context",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnNewFilesV2": {
        "path": "/{connectionId}/datasets/default/triggers/batch/onnewfilesv2",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "folderId",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "includeSubfolders",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "maxFileCount",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "simulate",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "x-ms-operation-context",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnUpdatedFilesV2": {
        "path": "/{connectionId}/datasets/default/triggers/batch/onupdatedfilesv2",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "folderId",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "includeSubfolders",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "maxFileCount",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "simulate",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "x-ms-operation-context",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListFolder": {
        "path": "/{connectionId}/datasets/default/folders/{id}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "includeSubfolders",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListFolderV2": {
        "path": "/{connectionId}/datasets/default/foldersV2/{id}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "skipToken",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "top",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListRootFolder": {
        "path": "/{connectionId}/datasets/default/folders",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ExtractFolderV2": {
        "path": "/{connectionId}/datasets/default/extractFolderV2",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "source",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "destination",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "overwrite",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "FindFiles": {
        "path": "/{connectionId}/datasets/default/folders/{id}/search",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "query",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "findMode",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "maxFileCount",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "FindFilesByPath": {
        "path": "/{connectionId}/datasets/default/findFile",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "query",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "path",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "findMode",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "maxFileCount",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      }
    }
  }
};
